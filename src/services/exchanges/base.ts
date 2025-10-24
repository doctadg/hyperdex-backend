import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

export abstract class BaseExchangeClient extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected url: string;
  protected name: string;
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 10;
  protected reconnectDelay = 1000;
  protected isConnecting = false;
  protected isConnected = false;
  protected heartbeatInterval: NodeJS.Timeout | null = null;
  protected subscriptions: Set<string> = new Set();

  constructor(name: string, url: string) {
    super();
    this.name = name;
    this.url = url;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract subscribe(symbols: string[]): Promise<void>;
  abstract unsubscribe(symbols: string[]): Promise<void>;
  abstract sendHeartbeat(): void;

  protected createWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.isConnecting = true;
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          logger.info(`${this.name} WebSocket connected`);
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            logger.error(`${this.name} Failed to parse message:`, error);
          }
        });

        this.ws.on('error', (error: Error) => {
          logger.error(`${this.name} WebSocket error:`, error);
          this.emit('error', error);
          if (this.isConnecting) {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          logger.warn(`${this.name} WebSocket closed:`, { code, reason });
          this.isConnected = false;
          this.isConnecting = false;
          this.stopHeartbeat();
          this.emit('disconnected', { code, reason });
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('ping', () => {
          this.ws?.pong();
        });

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  protected abstract handleMessage(message: unknown): void;

  protected scheduleReconnect(): void {
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info(`${this.name} Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        this.connect().catch((error) => {
          logger.error(`${this.name} Reconnect failed:`, error);
        });
      }
    }, delay);
  }

  protected startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // 30 seconds
  }

  protected stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  protected sendMessage(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn(`${this.name} Cannot send message - WebSocket not connected`);
    }
  }

  public getStatus(): {
    connected: boolean;
    connecting: boolean;
    subscriptions: string[];
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      subscriptions: Array.from(this.subscriptions),
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  public async healthCheck(): Promise<boolean> {
    return this.isConnected;
  }
}