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
 */
import { Stream, TransformCallback } from 'node:stream';
import { BLANK_CHAR, BREAK_AT_EOF } from '@config/constant-values';
import { Query } from '@usecases/geocode/models/query';
import { IFormatTransform } from './iformat-transform';

export class JsonTransform extends Stream.Transform implements IFormatTransform {
  
  mimetype: string = 'application/json';

  private buffer: string = '';
  private lineNum: number = 0;

  public readonly mimeType = 'application/json';

  constructor(private readonly options: {
    debug?: boolean;
  }) {
    super({
      // Data format coming from the previous stream is object mode.
      // Because we expect GeocodeResult
      writableObjectMode: true,

      // Data format to the next stream is non-object mode.
      // Because we output string as Buffer.
      readableObjectMode: false,
    });
  }

  _transform(
    result: Query,
    _: BufferEncoding,
    callback: TransformCallback
  ): void {
    const out = this.buffer;

    if (this.lineNum > 0) {
      this.buffer = ',';
    } else {
      this.buffer = '[';
    }
    this.lineNum++;
    const output = {
      query: {
        input: result.input.data.address,
      },
      result: {
        output: result.formatted.address,
        score: result.formatted.score,
        other: result.tempAddress?.toOriginalString() || BLANK_CHAR,
        match_level: result.match_level.str,
        lg_code: result.lg_code ? result.lg_code : BLANK_CHAR,
        pref: result.pref || BLANK_CHAR,
        county: result.county || BLANK_CHAR,
        city: result.city || BLANK_CHAR,
        ward: result.ward || BLANK_CHAR,
        machiaza_id: result.machiaza_id || BLANK_CHAR,
        oaza_cho: result.oaza_cho || BLANK_CHAR,
        chome: result.chome || BLANK_CHAR,
        koaza: result.koaza || BLANK_CHAR,
        blk_num: result.block || BLANK_CHAR,
        blk_id: result.block_id || BLANK_CHAR,
        rsdt_num: result.rsdt_num || BLANK_CHAR,
        rsdt_id: result.rsdt_id || BLANK_CHAR,
        rsdt_num2: result.rsdt_num2 || BLANK_CHAR,
        rsdt2_id: result.rsdt2_id || BLANK_CHAR,
        rsdt_addr_flg: result.rsdt_addr_flg,
        prc_num1: result.prc_num1 || BLANK_CHAR,
        prc_num2: result.prc_num2 || BLANK_CHAR,
        prc_num3: result.prc_num3 || BLANK_CHAR,
        prc_id: result.prc_id || BLANK_CHAR,
        lat: result.rep_lat,
        lon: result.rep_lon,
        coordinate_level: result.coordinate_level.str,
      },
    };
    if (this.options.debug) {
      (output as any).debug = {
        pref_key: result.pref_key,
        city_key: result.city_key,
        town_key: result.town_key,
        parcel_key: result.parcel_key,
        rsdtblk_key: result.rsdtblk_key,
        rsdtdsp_key: result.rsdtdsp_key,
        spendTime: ((Date.now() - result.startTime) / 1000).toFixed(2),
      };
    }
    this.buffer += JSON.stringify(output);
    callback(null, out);
  }

  _final(callback: (error?: Error | null | undefined) => void): void {
    this.emit('data', this.buffer);
    this.emit('data', ']');
    this.emit('data', BREAK_AT_EOF); // ファイルの最後に改行を入れる
    callback();
  }
}
