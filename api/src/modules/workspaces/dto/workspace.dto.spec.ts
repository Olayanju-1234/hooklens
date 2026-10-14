import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WORKSPACE_NAME_MAX_LENGTH,
} from './workspace.dto.js';

type NamedDto = ClassConstructor<{ name?: string }>;

async function nameErrors(cls: NamedDto, name: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, { name }));
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe.each<[string, NamedDto]>([
  ['CreateWorkspaceDto', CreateWorkspaceDto],
  ['UpdateWorkspaceDto', UpdateWorkspaceDto],
])('%s name', (_label, cls) => {
  it('accepts a name at the limit and trims surrounding whitespace', async () => {
    const name = 'a'.repeat(WORKSPACE_NAME_MAX_LENGTH);
    await expect(nameErrors(cls, `  ${name}  `)).resolves.toEqual([]);
    expect(plainToInstance(cls, { name: '  Team  ' }).name).toBe('Team');
  });

  it('rejects names over the limit', async () => {
    const name = 'a'.repeat(WORKSPACE_NAME_MAX_LENGTH + 1);
    await expect(nameErrors(cls, name)).resolves.toContain('maxLength');
  });

  it('rejects blank names', async () => {
    await expect(nameErrors(cls, '   ')).resolves.toContain('isNotEmpty');
  });
});

it('UpdateWorkspaceDto allows omitting the name', async () => {
  const errors = await validate(
    plainToInstance(UpdateWorkspaceDto, { retentionDays: 30 }),
  );
  expect(errors).toEqual([]);
});
