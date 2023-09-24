// reflect-metadata is necessary for DI
import 'reflect-metadata';

import { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { container } from 'tsyringe';
import { Logger } from 'winston';
import {
  AbrgError,
  AbrgErrorLevel,
  AbrgMessage,
  fsIterator,
} from '../../domain';

import CLIInfinityProgress from 'cli-infinity-progress';
import { MultiBar, SingleBar } from 'cli-progress';
import { setupContainer, setupContainerParams } from '../../interface-adapter';
import { CkanDownloader } from '../../usecase';
import { loadDatasetProcess } from './loadDatasetProcess';

export namespace downloadDataset {
  let initialized = false;

  /**
   * DIコンテナを初期化する
   * @param params
   */
  export async function init(params: setupContainerParams) {
    if (initialized) {
      throw new Error('Already initialized');
    }
    initialized = true;
    await setupContainer(params);
  }

  export async function start({ dataDir, ckanId }: setupContainerParams) {
    if (!initialized) {
      throw new Error(
        'Must run init() or initForTest() before involving this function'
      );
    }

    const db = container.resolve<Database>('DATABASE');
    const logger: Logger = container.resolve('LOGGER');
    const downloadProgressBar = container.resolve<SingleBar>('PROGRESS_BAR');
    const loadingProgressBar = container.resolve<MultiBar>('MULTI_PROGRESS_BAR');
    const downloadDir = path.join(dataDir, 'download');

    if (!fs.existsSync(downloadDir)) {
      await fs.promises.mkdir(downloadDir);
    }

    // ダウンローダのインスタンスを作成
    const downloader = new CkanDownloader({
      datasetUrl: container.resolve<string>('DATASET_URL'),
      userAgent: container.resolve<string>('USER_AGENT'),
      db,
      ckanId,
    });

    // --------------------------------------
    // データの更新を確認する
    // --------------------------------------
    logger.info(AbrgMessage.toString(AbrgMessage.CHECKING_UPDATE));
    const { updateAvailable } = await downloader.updateCheck();

    // 更新データがなければ終了
    if (!updateAvailable) {
      return Promise.reject(
        new AbrgError({
          messageId: AbrgMessage.ERROR_NO_UPDATE_IS_AVAILABLE,
          level: AbrgErrorLevel.INFO,
        })
      );
    }

    // --------------------------------------
    // 最新データセットをダウンロードする
    // --------------------------------------
    logger.info(
      AbrgMessage.toString(AbrgMessage.START_DOWNLOADING_NEW_DATASET)
    );

    const dstFilePath = `${downloadDir}/${ckanId}.zip`;
    await downloader.download(dstFilePath);

    // --------------------------------------
    // ダウンロードしたzipファイルを全展開する
    // --------------------------------------
    logger.info(AbrgMessage.toString(AbrgMessage.EXTRACTING_THE_DATA));

    const tmpDir = await fs.promises.mkdtemp(path.dirname(dstFilePath));
    const fileLoadingProgress = new CLIInfinityProgress();
    fileLoadingProgress.setHeader('Finding dataset files...');
    fileLoadingProgress.start();
    const csvFiles = await fsIterator(
      tmpDir,
      downloadDir,
      '.csv',
      fileLoadingProgress
    );
    fileLoadingProgress.remove();

    // 各データセットのzipファイルを展開して、Databaseに登録する
    logger.info(AbrgMessage.toString(AbrgMessage.LOADING_INTO_DATABASE));
    await loadDatasetProcess({
      db,
      csvFiles,
      multiProgressBar: loadingProgressBar,
    });

    db.close();

    // 展開したzipファイルのディレクトリを削除
    await fs.promises.rm(tmpDir, { recursive: true });
  }
}
/*
 * CLIからのエントリーポイント
 */
export const onDownloadAction = async (params: setupContainerParams) => {
  await downloadDataset.init(params);
  await downloadDataset.start(params);
};
