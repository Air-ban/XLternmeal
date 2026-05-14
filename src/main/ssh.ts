const { Client } = require('ssh2');
const net = require('net');

interface ConnectionConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface SSHSession {
  id: string;
  client: any;
  stream: any;
}

export interface CommandExecutionDetails {
  output: string;
  exitCode: number | null;
  signal?: string;
}

interface PortForwardConfig {
  id?: string;
  sessionId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

interface PortForward {
  id: string;
  sessionId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  server: any;
}

export class SSHManager {
  private sessions: Map<string, SSHSession> = new Map();
  private forwards: Map<string, PortForward> = new Map();
  private dataCallbacks: Array<(sessionId: string, data: string) => void> = [];
  private closeCallbacks: Array<(sessionId: string) => void> = [];

  onData(cb: (sessionId: string, data: string) => void): void {
    this.dataCallbacks.push(cb);
  }

  onClose(cb: (sessionId: string) => void): void {
    this.closeCallbacks.push(cb);
  }

  connect(config: ConnectionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect(config.id);

      const client = new Client();

      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('Connection timed out'));
      }, 15000);

      client.on('ready', () => {
        clearTimeout(timeout);

        client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err: any, stream: any) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          this.sessions.set(config.id, { id: config.id, client, stream });

          stream.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            this.dataCallbacks.forEach(cb => cb(config.id, text));
          });

          stream.on('close', () => {
            this.stopForwardsBySession(config.id);
            this.sessions.delete(config.id);
            this.closeCallbacks.forEach(cb => cb(config.id));
          });

          stream.stderr.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            this.dataCallbacks.forEach(cb => cb(config.id, text));
          });

          resolve();
        });
      });

      client.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      const connectConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
        keepaliveInterval: 30000,
      };

      if (config.privateKey) {
        connectConfig.privateKey = config.privateKey;
      } else if (config.password) {
        connectConfig.password = config.password;
      }

      client.connect(connectConfig);
    });
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    this.stopForwardsBySession(sessionId);

    if (session) {
      session.stream.end();
      session.client.end();
      this.sessions.delete(sessionId);
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stream.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stream.setWindow(rows, cols, 0, 0);
    }
  }

  execute(sessionId: string, command: string): Promise<string> {
    return this.executeDetailed(sessionId, command).then((result) => result.output);
  }

  executeDetailed(sessionId: string, command: string): Promise<CommandExecutionDetails> {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        reject(new Error('Session not found'));
        return;
      }

      session.client.exec(command, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf-8');
        });

        stream.stderr.on('data', (data: Buffer) => {
          output += data.toString('utf-8');
        });

        stream.on('close', (code: number | null, signal: string | undefined) => {
          resolve({
            output,
            exitCode: typeof code === 'number' ? code : null,
            signal,
          });
        });
      });
    });
  }

  listFiles(sessionId: string, remotePath: string): Promise<Array<{
    name: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    size: number;
    modifyTime: number;
    permissions: number;
  }>> {
    return this.withSftp(sessionId, (sftp) => new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err: Error | undefined, list: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(list.map((item) => ({
          name: item.filename,
          type: item.longname?.startsWith('d')
            ? 'directory'
            : item.longname?.startsWith('l')
              ? 'symlink'
              : item.longname?.startsWith('-')
                ? 'file'
                : 'other',
          size: item.attrs?.size ?? 0,
          modifyTime: item.attrs?.mtime ?? 0,
          permissions: item.attrs?.mode ?? 0,
        })));
      });
    }));
  }

  makeDirectory(sessionId: string, remotePath: string): Promise<void> {
    return this.withSftp(sessionId, (sftp) => new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }));
  }

  deleteFile(sessionId: string, remotePath: string): Promise<void> {
    return this.withSftp(sessionId, (sftp) => new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }));
  }

  deleteDirectory(sessionId: string, remotePath: string): Promise<void> {
    return this.withSftp(sessionId, (sftp) => new Promise((resolve, reject) => {
      sftp.rmdir(remotePath, (err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }));
  }

  uploadFile(sessionId: string, localPath: string, remotePath: string): Promise<void> {
    return this.withSftp(sessionId, (sftp) => new Promise((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, (err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }));
  }

  downloadFile(sessionId: string, remotePath: string, localPath: string): Promise<void> {
    return this.withSftp(sessionId, (sftp) => new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, (err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }));
  }

  startPortForward(config: PortForwardConfig): Promise<Omit<PortForward, 'server'>> {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(config.sessionId);
      if (!session) {
        reject(new Error('Session not found'));
        return;
      }

      const id = config.id || `${config.sessionId}:${config.localHost}:${config.localPort}->${config.remoteHost}:${config.remotePort}`;
      if (this.forwards.has(id)) {
        reject(new Error('Port forward already exists'));
        return;
      }

      const server = net.createServer((socket: any) => {
        session.client.forwardOut(
          socket.remoteAddress || config.localHost,
          socket.remotePort || 0,
          config.remoteHost,
          config.remotePort,
          (err: Error | undefined, stream: any) => {
            if (err) {
              socket.destroy(err);
              return;
            }

            socket.pipe(stream).pipe(socket);
          }
        );
      });

      const onError = (err: Error) => {
        server.removeListener('listening', onListening);
        reject(err);
      };

      const onListening = () => {
        server.removeListener('error', onError);
        const address = server.address();
        const actualLocalPort = typeof address === 'object' && address ? address.port : config.localPort;
        const forward = {
          id,
          sessionId: config.sessionId,
          localHost: config.localHost,
          localPort: actualLocalPort,
          remoteHost: config.remoteHost,
          remotePort: config.remotePort,
          server,
        };
        this.forwards.set(id, forward);
        resolve(this.toForwardInfo(forward));
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(config.localPort, config.localHost);
    });
  }

  stopPortForward(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const forward = this.forwards.get(id);
      if (!forward) {
        resolve();
        return;
      }

      this.forwards.delete(id);
      forward.server.close((err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  listPortForwards(sessionId?: string): Array<Omit<PortForward, 'server'>> {
    return Array.from(this.forwards.values())
      .filter((forward) => !sessionId || forward.sessionId === sessionId)
      .map((forward) => this.toForwardInfo(forward));
  }

  closeAll(): void {
    this.forwards.forEach((forward) => {
      try {
        forward.server.close();
      } catch (e) {
        // ignore
      }
    });
    this.forwards.clear();

    this.sessions.forEach((session) => {
      try {
        session.stream.end();
        session.client.end();
      } catch (e) {
        // ignore
      }
    });
    this.sessions.clear();
  }

  private withSftp<T>(sessionId: string, run: (sftp: any) => Promise<T>): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error('Session not found'));
    }

    return new Promise((resolve, reject) => {
      session.client.sftp(async (err: Error | undefined, sftp: any) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const result = await run(sftp);
          if (typeof sftp.end === 'function') {
            sftp.end();
          }
          resolve(result);
        } catch (runErr) {
          if (typeof sftp.end === 'function') {
            sftp.end();
          }
          reject(runErr);
        }
      });
    });
  }

  private stopForwardsBySession(sessionId: string): void {
    this.forwards.forEach((forward, id) => {
      if (forward.sessionId === sessionId) {
        try {
          forward.server.close();
        } catch (e) {
          // ignore
        }
        this.forwards.delete(id);
      }
    });
  }

  private toForwardInfo(forward: PortForward): Omit<PortForward, 'server'> {
    return {
      id: forward.id,
      sessionId: forward.sessionId,
      localHost: forward.localHost,
      localPort: forward.localPort,
      remoteHost: forward.remoteHost,
      remotePort: forward.remotePort,
    };
  }
}
