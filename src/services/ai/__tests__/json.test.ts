import { parseJsonResponse } from '../json';

describe('parseJsonResponse', () => {
  it('reads a plain array', () => {
    expect(parseJsonResponse('[{"i":0,"t":"Hello."}]')).toEqual([
      { i: 0, t: 'Hello.' },
    ]);
  });

  it('reads through a code fence and surrounding prose', () => {
    expect(
      parseJsonResponse('Here you go:\n```json\n[{"i":1,"t":"Hi."}]\n```'),
    ).toEqual([{ i: 1, t: 'Hi.' }]);
  });

  it('repairs quote marks the model left bare inside dialogue', () => {
    expect(
      parseJsonResponse(
        '[{"i":36,"t":""We\'re doomed!""},{"i":37,"t":"Ash."}]',
      ),
    ).toEqual([
      { i: 36, t: '"We\'re doomed!"' },
      { i: 37, t: 'Ash.' },
    ]);
  });

  it('keeps escapes the model got right', () => {
    expect(
      parseJsonResponse('[{"i":0,"t":"He said \\"run\\" once."}]'),
    ).toEqual([{ i: 0, t: 'He said "run" once.' }]);
  });

  it('throws when there is no JSON to find', () => {
    expect(() => parseJsonResponse('I cannot help with that.')).toThrow(
      'Model did not return valid JSON',
    );
  });
});
