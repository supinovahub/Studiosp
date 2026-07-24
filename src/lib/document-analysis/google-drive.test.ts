import { describe, expect, it } from 'vitest';
import { parseGoogleDriveLink } from './google-drive';

describe('parseGoogleDriveLink', () => {
  it('aceita arquivos compartilhados do Drive', () => {
    const parsed = parseGoogleDriveLink(
      'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'
    );
    expect(parsed?.downloadUrl).toContain('1AbCdEfGhIjKlMnOp');
  });

  it('converte Documento Google para DOCX', () => {
    const parsed = parseGoogleDriveLink(
      'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit'
    );
    expect(parsed).toMatchObject({ filename: 'documento-1AbCdEfG.docx' });
    expect(parsed?.downloadUrl).toContain('format=docx');
  });

  it('rejeita domínios externos e URLs forjadas', () => {
    expect(
      parseGoogleDriveLink(
        'https://drive.google.com.evil.example/file/d/1AbCdEfGhIjKlMnOp/view'
      )
    ).toBeNull();
    expect(parseGoogleDriveLink('http://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBeNull();
  });
});
