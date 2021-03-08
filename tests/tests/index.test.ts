import { test, describe, expect } from '@jest/globals';

import { devLogin, getNotebooksForUser } from '@actually-colab/editor-client';

describe('', () => {
  test('', async () => {
    const { user } = await devLogin('jeff@test.com', 'jeff');
    expect(user).toMatchObject({ email: 'jeff@test.com' });
    const notebooks = await getNotebooksForUser();
    expect(notebooks).toHaveLength(0);
  });
});