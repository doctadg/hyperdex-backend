import {
  encodeFunctionData,
  createPublicClient,
  http,
  parseUnits,
} from "viem";
import { mainnet, arbitrum, bsc } from "viem/chains";
import {
  delegatedSignTransaction,
  createDelegatedEvmWalletClient,
} from "@dynamic-labs-wallet/node-evm";
import { prisma } from "../lib/prisma";
import { decryptDynamicHybridEncryption } from "../lib/encryption";
import {
  DEPOSIT_CONTRACTS,
  DEPOSIT_CONTRACT_ABI,
  ERC20_ABI,
} from "../config/deposit-contracts";
import { TOKEN_CONFIG } from "../config/TOKEN_CONFIG";
import { getTokenInfo } from "../helpers/getTokenDecimals";

class AsterDepositService {
  private delegatedClient;
  constructor() {
    const environmentId = process.env.DYNAMIC_ENV_ID!;
    const apiKey = process.env.DYNAMIC_API_KEY!;
    this.delegatedClient = createDelegatedEvmWalletClient({
      environmentId,
      apiKey,
    });
  }


  // Handles USDT / ERC20 deposits and native deposits (ETH, BNB)
  async processDeposit({
    walletId,
    tokenSymbol,
    amount,
    broker,
    network,
  }: {
    walletId: string;
    tokenSymbol?: string; // e.g., "USDT" or undefined for native
    amount: string;
    broker: number;
    network: string;
  }) {
    const creds = await prisma.delegationCredentials.findFirst({
      where: { walletId },
    });
    if (!creds) throw new Error("Delegation credentials not found");

    const networkKey = network.toLowerCase() as keyof typeof DEPOSIT_CONTRACTS;
    const contractInfo = DEPOSIT_CONTRACTS[networkKey];
    if (!contractInfo || !("chainId" in contractInfo))
      throw new Error(`Unsupported or non-EVM network: ${network}`);

    const publicClient = createPublicClient({
      chain: this.getChain(network),
      transport: http(),
    });

    const fromAddress = creds.address.toLowerCase() as `0x${string}`;
    const keyShare = this.decryptKeyShare(creds);
    const walletApiKey = this.decryptWalletApiKey(creds);

    const isNative = !tokenSymbol;
    const contractAddress = contractInfo.address as `0x${string}`;

    let decimals = 18;
    let tokenAddress: `0x${string}` | null = null;

    if (!isNative) {
      const tokenInfo = getTokenInfo(
        networkKey as keyof typeof TOKEN_CONFIG,
        tokenSymbol as keyof (typeof TOKEN_CONFIG)[keyof typeof TOKEN_CONFIG],
      );
      if (!tokenInfo)
        throw new Error(
          `Token ${tokenSymbol} not configured for ${network}`,
        );

      decimals = tokenInfo.decimals;
      tokenAddress = tokenInfo.address as `0x${string}`;
    } else {

    }

    //Convert amount to wei
    let amountToDeposit: string;
    try {
      amountToDeposit = parseUnits(amount, decimals).toString();
    } catch (e) {
      throw new Error(
        `Invalid amount format. Please provide a valid number string.`,
      );
    }

    if (BigInt(amountToDeposit) <= 0n) {
      throw new Error(`Deposit amount must be greater than 0.`);
    }
    console.log(
      `[AsterDeposit] Input: "${amount}", Scaled (${decimals}-dec): ${amountToDeposit}`,
    );

    //Convert amount to wei
    const value = isNative ? BigInt(amountToDeposit) : 0n;

    //Approval
    if (!isNative && tokenAddress) {
      console.log(`[AsterDeposit] Checking allowance for ${tokenSymbol}...`);
      const allowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [fromAddress, contractAddress],
      })) as bigint;

      if (allowance < BigInt(amountToDeposit)) {
        console.log(`[AsterDeposit] Approving ${tokenSymbol}...`);
        await this.approveToken(
          publicClient,
          walletId,
          walletApiKey,
          keyShare,
          fromAddress,
          tokenAddress,
          contractAddress,
          amountToDeposit,
          contractInfo.chainId,
        );
      } else {
        console.log(`[AsterDeposit] Existing allowance sufficient.`);
      }
    }

    const functionName = isNative ? "depositNative" : "deposit";
    const args = isNative ? [broker] : [tokenAddress, amountToDeposit, broker];
    const data = encodeFunctionData({
      abi: DEPOSIT_CONTRACT_ABI,
      functionName,
      args,
    });

    const nonce = await publicClient.getTransactionCount({
      address: fromAddress,
      blockTag: "pending",
    });
    const gas = await publicClient.estimateGas({
      account: fromAddress,
      to: contractAddress,
      data,
      value,
    });
    const feeData = await publicClient.estimateFeesPerGas();

    const tx = {
      to: contractAddress,
      data,
      value,
      chainId: contractInfo.chainId,
      nonce,
      gas,
      maxFeePerGas: (feeData.maxFeePerGas! * 12n) / 10n,
      maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas! * 12n) / 10n,
      type: "eip1559" as const,
    };

    console.log(`[AsterDeposit] Sending deposit tx...`);
    const signedTx = await delegatedSignTransaction(this.delegatedClient, {
      walletId,
      walletApiKey,
      keyShare,
      transaction: tx,
    });

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx as `0x${string}`,
    });

    console.log(
      `[AsterDeposit] Deposit complete: ${contractInfo.explorerUrl}${txHash}`,
    );
    return {
      txUrl: `${contractInfo.explorerUrl}${txHash}`,
      decimals,
      token: tokenSymbol || "NATIVE",
      network,
      amount,
    };
  }

  // Approve ERC20 token before deposit
  private async approveToken(
    publicClient: any,
    walletId: string,
    walletApiKey: string,
    keyShare: any,
    fromAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    spender: string,
    amount: string,
    chainId: number,
  ) {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });

    const nonce = await publicClient.getTransactionCount({
      address: fromAddress,
      blockTag: "pending",
    });
    const feeData = await publicClient.estimateFeesPerGas();
    const gas = await publicClient.estimateGas({
      account: fromAddress,
      to: tokenAddress,
      data,
    });

    const tx = {
      to: tokenAddress,
      data,
      value: 0n,
      chainId,
      nonce,
      gas,
      maxFeePerGas: (feeData.maxFeePerGas! * 12n) / 10n,
      maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas! * 12n) / 10n,
      type: "eip1559" as const,
    };

    const signedTx = await delegatedSignTransaction(this.delegatedClient, {
      walletId,
      walletApiKey,
      keyShare,
      transaction: tx,
    });

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx as `0x${string}`,
    });

    console.log(
      `[AsterDeposit] Approved ${spender} on ${tokenAddress}: ${txHash}`,
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[AsterDeposit] Approval confirmed`);
    return txHash;
  }

  // ---------------------- Helpers ----------------------
  private decryptKeyShare(creds: any) {
    const encrypted = {
      ct: creds.encryptedKeyShareCt,
      tag: creds.encryptedKeyShareTag,
      alg: creds.encryptedKeyShareAlg,
      iv: creds.encryptedKeyShareIv,
      ek: creds.encryptedKeyShareEk,
    };
    const decrypted = decryptDynamicHybridEncryption(
      encrypted,
      process.env.DELEGATION_PRIVATE_KEY!,
    );
    const parsed = JSON.parse(decrypted);
    const pubkey = new Uint8Array(
      Object.values(parsed.pubkey.pubkey).map(Number),
    );
    return { pubkey: { pubkey }, secretShare: parsed.secretShare };
  }

  private decryptWalletApiKey(creds: any) {
    const encrypted = {
      ct: creds.encryptedWalletApiKeyCt,
      tag: creds.encryptedWalletApiKeyTag,
      alg: creds.encryptedWalletApiKeyAlg,
      iv: creds.encryptedWalletApiKeyIv,
      ek: creds.encryptedWalletApiKeyEk,
    };
    return decryptDynamicHybridEncryption(
      encrypted,
      process.env.DELEGATION_PRIVATE_KEY!,
    );
  }

  private getChain(network: string) {
    switch (network.toLowerCase()) {
      case "ethereum":
        return mainnet;
      case "arbitrum":
        return arbitrum;
      case "bnb":
        return bsc;
      default:
        throw new Error(`Unsupported network: ${network}`);
    }
  }
}

export const asterDepositService = new AsterDepositService();
