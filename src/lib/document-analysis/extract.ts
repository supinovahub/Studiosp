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
  layout: ExtractedPageLayout[];
};

export type ExtractedMedia = {
  data: Uint8Array;
  filename: string;
  mimeType: 'image/png' | 'image/jpeg';
  page: number;
  width: number;
  height: number;
};

export type ExtractedPageLayout = {
  page: number;
  width: number;
  height: number;
  rows: Array<{
    y: number;
    cells: Array<{ text: string; x: number; width: number }>;
  }>;
  links: Array<{ text: string; url: string }>;
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
      layout: [],
    };
  }

  if (declaredMime === 'application/pdf') {
    if (detectedMime !== 'application/pdf') {
      throw new Error('A assinatura do arquivo não corresponde a um PDF.');
    }
    // pdf-parse/pdf.js pode transferir e desanexar o ArrayBuffer recebido.
    // Cada consumidor precisa de uma cópia física criada antes da primeira
    // leitura; copiar depois já falha com "detached ArrayBuffer".
    const textBytes = bytes.slice();
    const imageBytes = bytes.slice();
    const layoutBytes = bytes.slice();
    const textParser = new PDFParse({ data: textBytes });
    let result: Awaited<ReturnType<PDFParse['getText']>>;
    try {
      result = await textParser.getText();
    } finally {
      await textParser.destroy();
    }
    if (result.total > 300) {
      throw new Error('O documento ultrapassa o limite de 300 páginas.');
    }

    // Não reutilize a instância que extraiu texto. Em alguns runtimes serverless
    // o worker do pdf.js transfere o buffer na primeira operação; uma segunda
    // chamada na mesma instância tenta fatiar memória já desanexada.
    const imageParser = new PDFParse({ data: imageBytes });
    let images: Awaited<ReturnType<PDFParse['getImage']>>;
    try {
      images = await imageParser.getImage({
        imageThreshold: 250,
        imageDataUrl: true,
        imageBuffer: true,
      });
    } finally {
      await imageParser.destroy();
    }
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
    const layout = await extractPdfLayout(layoutBytes);
    const positionedText = layoutPrompt(layout, 120_000);
    const linearText = balancedPageText(pageText, 120_000);
    return {
      // Reservamos espaço para as duas representações. Em tabelões extensos,
      // anexar o layout ao fim faria o limite da análise descartá-lo.
      text: positionedText.concat('\n\n', linearText),
      pageCount: result.total,
      detectedMime,
      metadata: {
        extraction: 'pdf-parse',
        pages: pageText.map((page) => ({
          page: page.page,
          textLength: page.text.length,
        })),
        extractedImageCount: media.length,
        positionedRowCount: layout.reduce(
          (total, page) => total + page.rows.length,
          0
        ),
        linkCount: layout.reduce((total, page) => total + page.links.length, 0),
      },
      media,
      layout,
    };
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
      layout: [],
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
      layout: [],
    };
  }

  if (declaredMime === 'image/png' || declaredMime === 'image/jpeg') {
    throw new Error(
      'Imagem bloqueada: o OCR externo não pode receber uma página antes da higienização de dados pessoais.'
    );
  }

  throw new Error('Formato sem extrator seguro disponível.');
}

async function extractPdfLayout(
  bytes: Uint8Array
): Promise<ExtractedPageLayout[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  }).promise;
  const pages: ExtractedPageLayout[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const [content, annotations] = await Promise.all([
        page.getTextContent(),
        page.getAnnotations(),
      ]);
      const positioned = content.items.flatMap((raw) => {
        if (!('str' in raw) || !raw.str.trim()) return [];
        return [
          {
            text: raw.str.trim().slice(0, 500),
            x: Number(raw.transform[4].toFixed(2)),
            y: Number(raw.transform[5].toFixed(2)),
            width: Number(raw.width.toFixed(2)),
          },
        ];
      });
      const rows: ExtractedPageLayout['rows'] = [];
      for (const item of positioned
        .sort((left, right) => right.y - left.y || left.x - right.x)
        .slice(0, 10_000)) {
        // Os itens já estão ordenados por Y; comparar com a última linha evita
        // busca quadrática em tabelões com milhares de células por página.
        const candidate = rows.at(-1);
        const row =
          candidate && Math.abs(candidate.y - item.y) <= 1.5 ? candidate : null;
        if (row) {
          row.cells.push({ text: item.text, x: item.x, width: item.width });
        } else {
          rows.push({
            y: item.y,
            cells: [{ text: item.text, x: item.x, width: item.width }],
          });
        }
      }
      for (const row of rows) row.cells.sort((left, right) => left.x - right.x);
      pages.push({
        page: pageNumber,
        width: Number(viewport.width.toFixed(2)),
        height: Number(viewport.height.toFixed(2)),
        rows: rows.slice(0, 2_000),
        links: annotations.flatMap((annotation) => {
          const url =
            typeof annotation.url === 'string' ? annotation.url.trim() : '';
          if (!url || !/^https?:\/\//i.test(url)) return [];
          return [
            {
              text:
                typeof annotation.titleObj?.str === 'string'
                  ? annotation.titleObj.str.slice(0, 300)
                  : '',
              url: url.slice(0, 2_000),
            },
          ];
        }),
      });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pages;
}

function layoutPrompt(layout: ExtractedPageLayout[], maxChars: number) {
  const pages: string[] = [];
  const pageBudget = Math.max(
    400,
    Math.floor(maxChars / Math.max(1, layout.length))
  );
  for (const page of layout) {
    const lines: string[] = [];
    lines.push(`[PÁGINA ${page.page} — LAYOUT POSICIONAL]`);
    for (const row of page.rows) {
      const cells = row.cells.map((cell) => cell.text).filter(Boolean);
      if (cells.length > 1) lines.push(cells.join(' | '));
    }
    for (const link of page.links) {
      lines.push(`LINK | ${link.text || 'sem rótulo'} | ${link.url}`);
    }
    pages.push(lines.join('\n').slice(0, pageBudget));
  }
  return pages.join('\n\n').slice(0, maxChars);
}

function balancedPageText(
  pages: Array<{ page: number; text: string }>,
  maxChars: number
) {
  const pageBudget = Math.max(
    400,
    Math.floor(maxChars / Math.max(1, pages.length))
  );
  return pages
    .map((page) => `[PÁGINA ${page.page}]\n${page.text}`.slice(0, pageBudget))
    .join('\n\n')
    .slice(0, maxChars);
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
