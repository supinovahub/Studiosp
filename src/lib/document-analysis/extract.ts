import { fileTypeFromBuffer } from 'file-type';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export type ExtractedDocument = {
  text: string;
  pageCount: number | null;
  detectedMime: string;
  metadata: Record<string, unknown>;
  media: ExtractedMedia[];
};

export type ExtractedMedia = {
  data: Uint8Array;
  filename: string;
  mimeType: 'image/png' | 'image/jpeg';
  page: number;
  width: number;
  height: number;
};

const TEXT_MIMES = new Set(['text/plain', 'text/csv']);

export async function extractDocument(
  bytes: Uint8Array,
  declaredMime: string
): Promise<ExtractedDocument> {
  const signature = await fileTypeFromBuffer(bytes);
  const detectedMime = signature?.mime ?? declaredMime;

  if (TEXT_MIMES.has(declaredMime)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return {
      text,
      pageCount: null,
      detectedMime: declaredMime,
      metadata: { extraction: 'text-decoder' },
      media: [],
    };
  }

  if (declaredMime === 'application/pdf') {
    if (detectedMime !== 'application/pdf') {
      throw new Error('A assinatura do arquivo não corresponde a um PDF.');
    }
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      if (result.total > 300) {
        throw new Error('O documento ultrapassa o limite de 300 páginas.');
      }
      const images = await parser.getImage({
        imageThreshold: 250,
        imageDataUrl: true,
        imageBuffer: true,
      });
      const media = images.pages
        .flatMap((page) =>
          page.images.map((image, index) => {
            const mimeType = image.dataUrl.startsWith('data:image/jpeg')
              ? ('image/jpeg' as const)
              : ('image/png' as const);
            return {
              data: image.data,
              filename: `pagina-${page.pageNumber}-imagem-${index + 1}.${mimeType === 'image/jpeg' ? 'jpg' : 'png'}`,
              mimeType,
              page: page.pageNumber,
              width: image.width,
              height: image.height,
            };
          })
        )
        .sort(
          (left, right) => right.width * right.height - left.width * left.height
        )
        .slice(0, 60);
      const pageText = result.pages.map((page) => ({
        page: page.num,
        text: page.text,
      }));
      return {
        text: pageText
          .map((page) => `[PÁGINA ${page.page}]\n${page.text}`)
          .join('\n\n'),
        pageCount: result.total,
        detectedMime,
        metadata: {
          extraction: 'pdf-parse',
          pages: pageText.map((page) => ({
            page: page.page,
            textLength: page.text.length,
          })),
          extractedImageCount: media.length,
        },
        media,
      };
    } finally {
      await parser.destroy();
    }
  }

  if (
    declaredMime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    if (!detectedMime.includes('officedocument')) {
      throw new Error('A assinatura do arquivo não corresponde a um DOCX.');
    }
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return {
      text: result.value,
      pageCount: null,
      detectedMime,
      metadata: {
        extraction: 'mammoth',
        warnings: result.messages
          .map((message) => message.message)
          .slice(0, 20),
      },
      media: [],
    };
  }

  if (
    declaredMime ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS ainda declara o Buffer da versão antiga de @types/node. O valor
    // real é um Uint8Array/Buffer válido; o cast fica restrito a esta fronteira.
    await workbook.xlsx.load(Buffer.from(bytes) as never);
    const sheets: string[] = [];
    workbook.eachSheet((sheet) => {
      const rows: string[] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = row.values as unknown[];
        rows.push(
          values
            .slice(1)
            .map((value) => csvCell(value))
            .join(',')
        );
      });
      sheets.push(`# Planilha: ${sheet.name}\n${rows.join('\n')}`);
    });
    return {
      text: sheets.join('\n\n'),
      pageCount: null,
      detectedMime,
      metadata: {
        extraction: 'exceljs',
        sheets: workbook.worksheets.map((sheet) => sheet.name),
      },
      media: [],
    };
  }

  if (declaredMime === 'image/png' || declaredMime === 'image/jpeg') {
    throw new Error(
      'Imagem bloqueada: o OCR externo não pode receber uma página antes da higienização de dados pessoais.'
    );
  }

  throw new Error('Formato sem extrator seguro disponível.');
}

function csvCell(value: unknown) {
  let safeValue = value;
  if (value instanceof Date) safeValue = value.toISOString();
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Fórmulas nunca são executadas; aproveitamos somente o resultado já
    // armazenado no arquivo, quando existir.
    safeValue =
      record.result ??
      record.text ??
      record.hyperlink ??
      record.richText ??
      '[VALOR COMPLEXO]';
  }
  const text =
    typeof safeValue === 'string'
      ? safeValue
      : safeValue == null
        ? ''
        : JSON.stringify(safeValue);
  return `"${text.replaceAll('"', '""')}"`;
}
