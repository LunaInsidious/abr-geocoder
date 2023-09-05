import { Stream } from "node:stream";
import { GeocodeResult, GeocodeResultFields } from '../GeocodeResult.class';
import { TransformCallback } from "stream";

export class CsvTransform extends Stream.Transform {
  private readonly rows: string[] = [];

  constructor(private readonly options: {
    columns: GeocodeResultFields[],
    skipHeader: boolean,
  }) {
    super({
      // Data format coming from the previous stream is object mode.
      // Because we expect GeocodeResult
      writableObjectMode: true,

      // Data format to the next stream is non-object mode.
      // Because we output string as Buffer.
      readableObjectMode: false,
    });
    if (this.options.skipHeader) {
      return;
    }
    this.rows.push(
      options.columns.map(column => column.toString()).join(', '),
    );
  }

  _transform(result: GeocodeResult, encoding: BufferEncoding, callback: TransformCallback): void {
    
    const line = this.options.columns.map(column => {
      switch(column) {
        case GeocodeResultFields.INPUT:
          return `"${result.input}"`;

        case GeocodeResultFields.LATITUDE:
          return result.lat?.toString() || '';

        case GeocodeResultFields.LONGITUDE:
          return result.lon?.toString() || '';
        
        case GeocodeResultFields.PREFECTURE:
          return `"${result.prefecture}"`;
        
        case GeocodeResultFields.CITY:
          return `"${result.city}"`;

        case GeocodeResultFields.LG_CODE:
          return `"${result.lg_code}"`;
        
        case GeocodeResultFields.TOWN:
          return `"${result.town}"`;

        case GeocodeResultFields.TOWN_ID:
          return `"${result.town_id}"`;

        case GeocodeResultFields.OTHER:
          return `"${result.other}"`;
        
        case GeocodeResultFields.BLOCK:
          return `"${result.block}"`;

        case GeocodeResultFields.BLOCK_ID:
          return `"${result.block_id}"`;
      }
    }).join(', ');

    this.rows.push(line);
    this.rows.push('');
    const csvLines: string = this.rows.join("\n");
    this.rows.length = 0;

    callback(null, csvLines);
  }
}