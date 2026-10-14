import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAvatarDto } from './auth.dto.js';

async function avatarErrors(avatarUrl: unknown): Promise<string[]> {
  const dto = plainToInstance(UpdateAvatarDto, { avatarUrl });
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('UpdateAvatarDto', () => {
  it('accepts an https URL', async () => {
    await expect(
      avatarErrors('https://gravatar.com/avatar/abc123'),
    ).resolves.toEqual([]);
  });

  it.each([
    'http://gravatar.com/avatar/abc123',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'gravatar.com/avatar/abc123',
  ])('rejects %s', async (url) => {
    await expect(avatarErrors(url)).resolves.toContain('isUrl');
  });

  it('rejects URLs longer than the 500-char column', async () => {
    const url = `https://example.com/${'a'.repeat(481)}`;
    expect(url.length).toBe(501);
    await expect(avatarErrors(url)).resolves.toContain('maxLength');
  });
});
