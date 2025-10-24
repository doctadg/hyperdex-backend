import WebSocket from 'ws';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { orderbookProcessor } from '@/services/processors/orderbook';
import { tradeProcessor } from '@/services/processors/trades';
import { chartProcessor } from '@/services/processors/charts';

interface ClientSubscription {
  id: string;
  type: 'orderbook' | 'trades' | 'charts';
  symbol: string;
  exchange: 'hyperliquid' | 'aster' | 'lighter';
  params?: Record<string, any>;
}

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Map<string, ClientSubscription>;
  lastPing: number;
  isAlive: boolean;
}

export class WebSocketServer {
  private wss: WebSocket.Server;
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval!: NodeJS.Timeout;

  constructor() {
    this.wss = new WebSocket.Server({
      port: config.server.port + 1, // Use port + 1 for WebSocket
      perMessageDeflate: false,
    });

    this.setupServer();
    this.startHeartbeat();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        ws,
        subscriptions: new Map(),
        lastPing: Date.now(),
        isAlive: true,
      };

      this.clients.set(clientId, client);
      logger.info(`WebSocket client connected: ${clientId} from ${req.socket.remoteAddress}`);

      // Send welcome message
      this.sendToClient(client, {
        type: 'welcome',
        data: {
          clientId,
          serverTime: Date.now(),
          exchanges: ['hyperliquid', 'aster', 'lighter'],
          supportedSubscriptions: ['orderbook', 'trades', 'charts'],
        },
      });

      // Handle messages
      ws.on('message', (message: WebSocket.Data) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(client, data);
        } catch (error) {
          logger.error(`Invalid message from client ${clientId}:`, error);
          this.sendError(client, 'Invalid message format');
        }
      });

      // Handle connection close
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`WebSocket client disconnected: ${clientId}`);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Handle pong responses
      ws.on('pong', () => {
        client.isAlive = true;
        client.lastPing = Date.now();
      });
    });

    logger.info(`WebSocket server started on port ${config.server.port + 1}`);
  }

  private handleMessage(client: WebSocketClient, message: any): void {
    const { type, data, id } = message;

    switch (type) {
      case 'subscribe':
        this.handleSubscribe(client, data, id);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, data, id);
        break;
      case 'ping':
        this.sendToClient(client, { type: 'pong', id });
        break;
      default:
        this.sendError(client, `Unknown message type: ${type}`, id);
    }
  }

  private handleSubscribe(client: WebSocketClient, data: any, messageId: string): void {
    const { subscriptionType, symbol, exchange, params } = data;

    if (!subscriptionType || !symbol || !exchange) {
      this.sendError(client, 'Missing required fields: subscriptionType, symbol, exchange', messageId);
      return;
    }

    if (!['orderbook', 'trades', 'charts'].includes(subscriptionType)) {
      this.sendError(client, 'Invalid subscription type', messageId);
      return;
    }

    if (!['hyperliquid', 'aster', 'lighter'].includes(exchange)) {
      this.sendError(client, 'Invalid exchange', messageId);
      return;
    }

    const subscriptionId = `${subscriptionType}:${exchange}:${symbol}`;
    const subscription: ClientSubscription = {
      id: subscriptionId,
      type: subscriptionType,
      symbol,
      exchange: exchange as 'hyperliquid' | 'aster' | 'lighter',
      params,
    };

    client.subscriptions.set(subscriptionId, subscription);

    // Send initial data
    this.sendInitialData(client, subscription);

    // Confirm subscription
    this.sendToClient(client, {
      type: 'subscribed',
      data: {
        subscriptionId,
        subscriptionType,
        symbol,
        exchange,
      },
      id: messageId,
    });

    logger.info(`Client ${client.id} subscribed to ${subscriptionId}`);
  }

  private handleUnsubscribe(client: WebSocketClient, data: any, messageId: string): void {
    const { subscriptionId } = data;

    if (!subscriptionId) {
      this.sendError(client, 'Missing subscriptionId', messageId);
      return;
    }

    const unsubscribed = client.subscriptions.delete(subscriptionId);

    this.sendToClient(client, {
      type: 'unsubscribed',
      data: {
        subscriptionId,
        success: unsubscribed,
      },
      id: messageId,
    });

    if (unsubscribed) {
      logger.info(`Client ${client.id} unsubscribed from ${subscriptionId}`);
    }
  }

  private async sendInitialData(client: WebSocketClient, subscription: ClientSubscription): Promise<void> {
    try {
      switch (subscription.type) {
        case 'orderbook':
          const orderbook = await orderbookProcessor.getTopLevels(
            subscription.symbol,
            subscription.exchange,
            20
          );
          if (orderbook) {
            this.sendToClient(client, {
              type: 'orderbook',
              data: {
                subscriptionId: subscription.id,
                symbol: subscription.symbol,
                exchange: subscription.exchange,
                ...orderbook,
                timestamp: Date.now(),
              },
            });
          }
          break;

        case 'trades':
          const trades = await tradeProcessor.getRecentTrades(
            subscription.symbol,
            subscription.exchange,
            50
          );
          if (trades) {
            this.sendToClient(client, {
              type: 'trades',
              data: {
                subscriptionId: subscription.id,
                symbol: subscription.symbol,
                exchange: subscription.exchange,
                trades,
                timestamp: Date.now(),
              },
            });
          }
          break;

        case 'charts':
          const currentCandle = chartProcessor.getCurrentCandle(
            subscription.symbol,
            subscription.exchange,
            subscription.params?.timeframe || '1h'
          );
          if (currentCandle) {
            this.sendToClient(client, {
              type: 'chart',
              data: {
                subscriptionId: subscription.id,
                symbol: subscription.symbol,
                exchange: subscription.exchange,
                timeframe: subscription.params?.timeframe || '1h',
                candle: currentCandle,
                timestamp: Date.now(),
              },
            });
          }
          break;
      }
    } catch (error) {
      logger.error(`Error sending initial data for ${subscription.id}:`, error);
    }
  }

  // Public methods to broadcast updates
  public broadcastOrderbookUpdate(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter', data: any): void {
    const subscriptionId = `orderbook:${exchange}:${symbol}`;
    
    this.clients.forEach((client) => {
      if (client.subscriptions.has(subscriptionId)) {
        this.sendToClient(client, {
          type: 'orderbook',
          data: {
            subscriptionId,
            symbol,
            exchange,
            ...data,
            timestamp: Date.now(),
          },
        });
      }
    });
  }

  public broadcastTradeUpdate(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter', trade: any): void {
    const subscriptionId = `trades:${exchange}:${symbol}`;
    
    this.clients.forEach((client) => {
      if (client.subscriptions.has(subscriptionId)) {
        this.sendToClient(client, {
          type: 'trade',
          data: {
            subscriptionId,
            symbol,
            exchange,
            trade,
            timestamp: Date.now(),
          },
        });
      }
    });
  }

  public broadcastChartUpdate(symbol: string, exchange: 'hyperliquid' | 'aster' | 'lighter', timeframe: string, candle: any): void {
    const subscriptionId = `charts:${exchange}:${symbol}`;
    
    this.clients.forEach((client) => {
      const subscription = client.subscriptions.get(subscriptionId);
      if (subscription && (!subscription.params?.timeframe || subscription.params.timeframe === timeframe)) {
        this.sendToClient(client, {
          type: 'chart',
          data: {
            subscriptionId,
            symbol,
            exchange,
            timeframe,
            candle,
            timestamp: Date.now(),
          },
        });
      }
    });
  }

  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Error sending message to client ${client.id}:`, error);
      }
    }
  }

  private sendError(client: WebSocketClient, error: string, messageId?: string): void {
    this.sendToClient(client, {
      type: 'error',
      data: { error },
      id: messageId,
    });
  }

  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client.id);
          logger.info(`WebSocket client terminated due to timeout: ${client.id}`);
          return;
        }

        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      });
    }, 30000); // 30 seconds
  }

  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((client) => {
      client.ws.close();
    });

    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }

  public getStats(): any {
    return {
      connectedClients: this.clients.size,
      totalSubscriptions: Array.from(this.clients.values())
        .reduce((total, client) => total + client.subscriptions.size, 0),
    };
  }
}

export let wsServer: WebSocketServer;