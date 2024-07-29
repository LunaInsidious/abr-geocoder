/*!
 * MIT License
 *
 * Copyright (c) 2023 デジタル庁
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */;
import { DownloadProcessError, DownloadQueryBase, DownloadRequest, isDownloadProcessError } from '@domain/models/download-process-query';
import { WorkerThreadPool } from '@domain/services/thread/worker-thread-pool';
import { DownloadDiContainer } from '@usecases/download/models/download-di-container';
import { DownloadWorkerInitData } from '@usecases/download/workers/download-worker';
import path from 'node:path';
import { Duplex, TransformCallback } from 'node:stream';
import timers from 'node:timers/promises';

export class DownloadTransform extends Duplex {

  private receivedFinal: boolean = false;

  private runningTasks = 0;

  // ダウンロードを担当するワーカースレッド
  private downloader: WorkerThreadPool<
    DownloadWorkerInitData, 
    DownloadRequest,
    DownloadQueryBase
  >;

  constructor(params : Required<{
    maxTasksPerWorker: number;
    container: DownloadDiContainer;
  }>) {
    super({
      objectMode: true,
      allowHalfOpen: true,
      read() {},
    });

    this.downloader = new WorkerThreadPool({
      // download-worker へのパス
      filename: path.join(__dirname, '..', 'workers', 'download-worker'),

      // download-worker の初期設定値
      initData: {
        containerParams: params.container.toJSON(),

        maxTasksPerWorker: params.maxTasksPerWorker,
      },

      // ダウンローダーのスレッドは1つだけにする
      // HTTP2.0で接続するので、TCPコネクションは1つだけで良い
      maxConcurrency: 1,

      // 同時ダウンロード数
      maxTasksPerWorker: params.maxTasksPerWorker,
    });
  }

  async close() {
    await this.downloader.close();
  }

  // 前のstreamからデータが渡されてくる
  async _write(
    params: DownloadRequest,
    _: BufferEncoding,
    // callback: (error?: Error | null | undefined) => void,
    callback: TransformCallback,
  ) {
    this.runningTasks++;

    // 次のタスクをもらうために、callbackを呼び出す
    callback();

    // キャッシュファイルがあれば利用してダウンロードする
    params.useCache = true;
    
    // 別スレッドで処理する。5回までリトライする
    let retry = 0;
    while (retry < 5) {
      try {
        const downloadResult = await this.downloader.run(params);
        this.runningTasks--;

        if (isDownloadProcessError(downloadResult)) {
          this.push(downloadResult as DownloadProcessError);
          if (this.runningTasks === 0 && this.receivedFinal) {
            this.push(null);
          }
          return;
        }

        this.push(downloadResult);
        if (this.runningTasks === 0 && this.receivedFinal) {
          this.push(null);
        }
        return;
      } catch (e) {
        console.debug("--------> retry!!!", e);
        console.debug(params);
        retry--;

        // ディレイを挿入
        await timers.setTimeout(Math.random() * 5000 + 100);

        // リトライする場合はキャッシュファイルを使わない
        params.useCache = false;
      }
    }
  }

  _final(callback: (error?: Error | null) => void): void {
    this.receivedFinal = true;
    callback();
  }
}
