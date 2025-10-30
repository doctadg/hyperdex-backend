import qs from "querystring";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { encrypt, decryptDynamicHybridEncryption } from "../lib/encryption";
import {
  createDelegatedEvmWalletClient,
  delegatedSignMessage,
  type DelegatedEvmWalletClient,
} from "@dynamic-labs-wallet/node-evm";
import { ethers } from "ethers";

const ASTER_HOST = "https://sapi.asterdex.com";
const OPERATION_TYPE = "CREATE_API_KEY";

interface ApiKeyResponse {
  apiKey: string;
  apiSecret: string;
  keyId: number;
  apiName: string | null;
}

export class AsterBrokerService {
  private dynamicClient: DelegatedEvmWalletClient;
  private delegationPrivateKey: string;

  constructor() {
    const environmentId = process.env.DYNAMIC_ENV_ID || "";
    const apiKey = process.env.DYNAMIC_API_KEY || "";
    this.delegationPrivateKey = process.env.DELEGATION_PRIVATE_KEY || "";

    if (!environmentId || !apiKey)
      throw new Error("DYNAMIC_ENV_ID and DYNAMIC_API_KEY must be set");
    if (!this.delegationPrivateKey)
      throw new Error("DELEGATION_PRIVATE_KEY must be set");

    this.dynamicClient = createDelegatedEvmWalletClient({
      environmentId,
      apiKey,
      debug: process.env.NODE_ENV === "development",
    });
  }

  async generateApiKey(walletIdOrAddress: string): Promise<{
    apiKey: string;
    apiSecret: string;
    keyId: number;
    signerAddress: string;
  }> {
    const credentials = await prisma.delegationCredentials.findFirst({
      where: {
        OR: [
          { walletId: walletIdOrAddress },
          { address: walletIdOrAddress.toLowerCase() },
        ],
      },
    });

    if (!credentials)
      throw new Error(
        "No delegation credentials found. Approve delegation first."
      );

    const existing = await prisma.asterApiKey.findFirst({
      where: {
        OR: [
          { walletId: credentials.walletId },
          { address: credentials.address },
        ],
      },
    });
    if (existing) throw new Error("API key already exists for this wallet.");
    const address = credentials.address;

    // Get noonce
    const nonce = await this.getNonce(address.toLowerCase());
    console.log("[AsterBroker] Got nonce:", nonce);

    // Sign message
    const signature = await this.signLoginMessage(nonce, credentials);
    console.log("[AsterBroker] Signature:", signature.substring(0, 20) + "...");

    // Create API-KEY
    const desc = `${Date.now()}_0`;
    const apiKeyData = await this.createApiKey(address, signature, desc);
    const signerWallet = new ethers.Wallet(apiKeyData.apiSecret);
    const derivedSignerAddress = signerWallet.address;
    // Store in DB
    await prisma.asterApiKey.create({
      data: {
        walletId: credentials.walletId,
        address: address.toLowerCase(),
        userId: credentials.userId,
        asterApiKey: encrypt(apiKeyData.apiKey),
        asterApiSecret: encrypt(apiKeyData.apiSecret),
        asterKeyId: apiKeyData.keyId,
        asterSignerAddress: derivedSignerAddress.toLowerCase(),
        createdAt: new Date(),
      },
    });

    return {
      apiKey: apiKeyData.apiKey,
      apiSecret: apiKeyData.apiSecret,
      keyId: apiKeyData.keyId,
      signerAddress: address,
    };
  }

  private async getNonce(address: string): Promise<number> {
    const url = `${ASTER_HOST}/api/v1/getNonce`;
    const body = qs.stringify({
      address,
      userOperationType: OPERATION_TYPE,
    });

    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (typeof resp.data === "number") return resp.data;

    throw new Error(`Failed to get nonce: ${JSON.stringify(resp.data)}`);
  }

  private async signLoginMessage(
    nonce: number,
    credentials: any
  ): Promise<string> {
    const encryptedKeyShare = {
      ct: credentials.encryptedKeyShareCt,
      tag: credentials.encryptedKeyShareTag,
      alg: credentials.encryptedKeyShareAlg,
      iv: credentials.encryptedKeyShareIv,
      ek: credentials.encryptedKeyShareEk,
    };
    const encryptedWalletApiKey = {
      ct: credentials.encryptedWalletApiKeyCt,
      tag: credentials.encryptedWalletApiKeyTag,
      alg: credentials.encryptedWalletApiKeyAlg,
      iv: credentials.encryptedWalletApiKeyIv,
      ek: credentials.encryptedWalletApiKeyEk,
    };
    const decryptedKeyShare = decryptDynamicHybridEncryption(
      encryptedKeyShare,
      this.delegationPrivateKey
    );
    const walletApiKey = decryptDynamicHybridEncryption(
      encryptedWalletApiKey,
      this.delegationPrivateKey
    );
    const parsedKeyShare = JSON.parse(decryptedKeyShare);
    const pubkeyValues = Object.values(parsedKeyShare.pubkey.pubkey).map(
      Number
    );
    const pubkeyArray = new Uint8Array(pubkeyValues);
    const keyShare = {
      pubkey: { pubkey: pubkeyArray },
      secretShare: parsedKeyShare.secretShare,
    };

    const message = `You are signing into Astherus ${nonce}`;
    const sig = await delegatedSignMessage(this.dynamicClient, {
      walletId: credentials.walletId,
      walletApiKey,
      keyShare,
      message,
    });

    const recovered = ethers.utils.verifyMessage(message, sig);
    if (recovered.toLowerCase() !== credentials.address.toLowerCase())
      throw new Error("Recovered address mismatch.");
    return sig;
  }

  private async createApiKey(
    address: string,
    userSignature: string,
    desc: string
  ): Promise<ApiKeyResponse> {
    const url = `${ASTER_HOST}/api/v1/createApiKey`;
    const body = qs.stringify({
      userSignature,
      address: address.toLowerCase(),
      desc,
      userOperationType: OPERATION_TYPE,
    });

    const resp = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("[AsterBroker] CreateKey response:", resp.data);
    if (!resp.data.apiKey) {
      throw new Error(
        `Failed to create API key: ${resp.data.msg || resp.data.message}`
      );
    }
    return resp.data as ApiKeyResponse;
  }
}

export const asterBrokerService = new AsterBrokerService();
