import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

interface EncryptedData {
  ct: string;
  tag: string;
  alg: string;
  iv: string;
  ek: string;
  kid?: string;
}

/**
 * Dynamic webhook payload for wallet.delegation.created
 */
interface DelegationCreatedPayload {
  eventId: string;
  webhookId: string;
  environmentId: string;
  data: {
    encryptedDelegatedShare: EncryptedData;
    walletId: string;
    chain: string;
    publicKey: string;
    userId: string;
    encryptedWalletApiKey: EncryptedData;
  };
  environmentName: string;
  messageId: string;
  eventName: 'wallet.delegation.created';
  userId: string;
  timestamp: string;
}

/**
 * Dynamic webhook payload for wallet.delegation.revoked
 */
interface DelegationRevokedPayload {
  eventId: string;
  webhookId: string;
  environmentId: string;
  data: {
    walletId: string;
    userId: string;
  };
  environmentName: string;
  messageId: string;
  eventName: 'wallet.delegation.revoked';
  userId: string;
  timestamp: string;
}

type DelegationWebhookPayload = DelegationCreatedPayload | DelegationRevokedPayload;

/**
 * Verify webhook signature from Dynamic
 * Dynamic uses x-dynamic-signature-256 header with format: sha256=<hash>
 */
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {

  const SKIP_VERIFICATION = process.env.SKIP_WEBHOOK_SIGNATURE_VERIFICATION === 'true';

  if (SKIP_VERIFICATION) {
    console.warn('[Webhook] ⚠️ SIGNATURE VERIFICATION DISABLED FOR DEBUGGING');
    return true;
  }

  if (!signatureHeader) {
    console.warn('[Webhook] No signature header provided');
    return false;
  }

  // Extract signature from "sha256=<hash>" format
  const signature = signatureHeader.replace('sha256=', '');

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  console.log('[Webhook] Signature verification:', {
    receivedSignature: signature.substring(0, 16) + '...',
    expectedSignature: expectedSignature.substring(0, 16) + '...',
    payloadLength: payload.length,
    secretLength: secret.length,
    match: signature === expectedSignature
  });

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[Webhook] Signature comparison failed:', error);
    return false;
  }
}

/**
 * Handle wallet.delegation.created webhook
 */
export async function handleDelegationCreated(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const webhookSecret = process.env.DYNAMIC_WEBHOOK_SECRET;
    const privateKey = process.env.DELEGATION_PRIVATE_KEY;

    if (!webhookSecret) {
      console.error('[Webhook] DYNAMIC_WEBHOOK_SECRET not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    if (!privateKey) {
      console.error('[Webhook] DELEGATION_PRIVATE_KEY not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    // Use raw body for signature verification (should be set by middleware)
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-dynamic-signature-256'] as string | undefined;

    console.log('[Webhook] Received delegation.created webhook');
    console.log('[Webhook] Event ID:', req.body.eventId);
    console.log('[Webhook] User ID:', req.body.userId);
    console.log('[Webhook] Signature header:', signature);
    console.log('[Webhook] Has rawBody:', !!(req as any).rawBody);
    console.log('[Webhook] Body length:', rawBody.length);
    console.log('[Webhook] First 100 chars of body:', rawBody.substring(0, 100));

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error('[Webhook] ❌ Invalid signature from IP:', req.ip);
      console.error('[Webhook] Expected signature header: x-dynamic-signature-256');
      console.error('[Webhook] Webhook secret configured:', !!webhookSecret);
      console.error('[Webhook] Raw body sample:', rawBody.substring(0, 200));
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body as DelegationCreatedPayload;

    if (payload.eventName !== 'wallet.delegation.created') {
      console.error('[Webhook] Invalid event type:', payload.eventName);
      res.status(400).json({ error: 'Invalid event type' });
      return;
    }

    const { walletId, userId, encryptedDelegatedShare, encryptedWalletApiKey, chain, publicKey } = payload.data;

    if (!walletId || !userId || !encryptedDelegatedShare || !encryptedWalletApiKey) {
      console.error('[Webhook] Missing required fields in payload');
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Store ENCRYPTED credentials in database (DO NOT decrypt here)
    console.log('[Webhook] Storing encrypted credentials in database...');

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.delegationCredentials.upsert({
      where: { walletId },
      update: {
        address: publicKey.toLowerCase(),
        userId,
        chain: chain || 'EVM',
        encryptedKeyShareCt: encryptedDelegatedShare.ct,
        encryptedKeyShareTag: encryptedDelegatedShare.tag,
        encryptedKeyShareAlg: encryptedDelegatedShare.alg,
        encryptedKeyShareIv: encryptedDelegatedShare.iv,
        encryptedKeyShareEk: encryptedDelegatedShare.ek,
        encryptedWalletApiKeyCt: encryptedWalletApiKey.ct,
        encryptedWalletApiKeyTag: encryptedWalletApiKey.tag,
        encryptedWalletApiKeyAlg: encryptedWalletApiKey.alg,
        encryptedWalletApiKeyIv: encryptedWalletApiKey.iv,
        encryptedWalletApiKeyEk: encryptedWalletApiKey.ek,
        expiresAt,
      },
      create: {
        walletId,
        address: publicKey.toLowerCase(),
        userId,
        chain: chain || 'EVM',
        encryptedKeyShareCt: encryptedDelegatedShare.ct,
        encryptedKeyShareTag: encryptedDelegatedShare.tag,
        encryptedKeyShareAlg: encryptedDelegatedShare.alg,
        encryptedKeyShareIv: encryptedDelegatedShare.iv,
        encryptedKeyShareEk: encryptedDelegatedShare.ek,
        encryptedWalletApiKeyCt: encryptedWalletApiKey.ct,
        encryptedWalletApiKeyTag: encryptedWalletApiKey.tag,
        encryptedWalletApiKeyAlg: encryptedWalletApiKey.alg,
        encryptedWalletApiKeyIv: encryptedWalletApiKey.iv,
        encryptedWalletApiKeyEk: encryptedWalletApiKey.ek,
        expiresAt,
      },
    });

    console.log('[Webhook] ✅ Delegation credentials stored in database:', {
      userId,
      walletId,
      address: publicKey,
      chain,
      timestamp: payload.timestamp,
      expiresAt: expiresAt.toISOString(),
    });

    res.status(200).json({
      success: true,
      message: 'Delegation stored successfully',
      walletId,
      userId
    });
  } catch (error) {
    console.error('[Webhook] ❌ Error handling delegation.created:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handle wallet.delegation.revoked webhook
 */
export async function handleDelegationRevoked(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const webhookSecret = process.env.DYNAMIC_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Webhook] DYNAMIC_WEBHOOK_SECRET not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    // Use raw body for signature verification (should be set by middleware)
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-dynamic-signature-256'] as string | undefined;

    console.log('[Webhook] Received delegation.revoked webhook');
    console.log('[Webhook] Event ID:', req.body.eventId);
    console.log('[Webhook] Signature header:', signature);

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error('[Webhook] Invalid signature for revocation from IP:', req.ip);
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body as DelegationRevokedPayload;

    if (payload.eventName !== 'wallet.delegation.revoked') {
      console.error('[Webhook] Invalid event type:', payload.eventName);
      res.status(400).json({ error: 'Invalid event type' });
      return;
    }

    const { walletId, userId } = payload.data;

    if (!walletId || !userId) {
      console.error('[Webhook] Missing required fields in payload');
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Delete credentials from database
    await prisma.delegationCredentials.delete({
      where: { walletId },
    });

    console.log('[Webhook] ✅ Delegation revoked and removed from database:', {
      userId,
      walletId,
      timestamp: payload.timestamp,
    });

    res.status(200).json({
      success: true,
      message: 'Delegation revoked successfully',
      walletId,
      userId
    });
  } catch (error) {
    console.error('[Webhook] ❌ Error handling delegation.revoked:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Unified webhook handler
 */
export async function handleDelegationWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const payload = req.body as DelegationWebhookPayload;

  console.log('[Webhook] Received webhook event:', payload.eventName);

  switch (payload.eventName) {
    case 'wallet.delegation.created':
      return handleDelegationCreated(req, res);
    case 'wallet.delegation.revoked':
      return handleDelegationRevoked(req, res);
    default:
      console.error('[Webhook] Unknown event type:', (payload as any).eventName);
      res.status(400).json({ error: 'Unknown event type' });
  }
}
