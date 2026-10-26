import { INestApplication } from '@nestjs/common';
import {
  ACCOUNTS,
  auth,
  createCase,
  getTestApp,
  departments,
  http,
  login,
} from './helpers';

const INSTRUCTION = 'Please review this correspondence and take the required action.';

describe('Workflow actions (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<string, string>;

  beforeAll(async () => {
    app = (await getTestApp()).app;
    tokens = {
      admin: (await login(app, ACCOUNTS.admin)).token,
      omar: (await login(app, ACCOUNTS.employee)).token,
      nora: (await login(app, ACCOUNTS.secretariat)).token,
      fahad: (await login(app, ACCOUNTS.studies)).token,
      hind: (await login(app, ACCOUNTS.technical)).token,
      khalid: (await login(app, ACCOUNTS.chairman)).token,
    };
  });

  it('runs the full review cycle through a chairman decision', async () => {
    const created = await createCase(app, tokens.omar, {
      title: 'Full lifecycle correspondence',
    });
    expect(created.currentStage).toBe('secretariat');
    expect(created.availableActions).toEqual([]);

    const asOmar = await http(app)
      .get(`/api/cases/${created.id}`)
      .set(auth(tokens.omar))
      .expect(200);
    expect(asOmar.body.availableActions).toEqual([]);

    const asNora = await http(app)
      .get(`/api/cases/${created.id}`)
      .set(auth(tokens.nora))
      .expect(200);
    expect(asNora.body.availableActions).toEqual(['forward', 'return']);

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(tokens.omar))
      .field('instruction', INSTRUCTION)
      .expect(403);

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(tokens.fahad))
      .field('instruction', INSTRUCTION)
      .expect(404);

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(tokens.nora))
      .field('instruction', INSTRUCTION)
      .expect(201)
      .expect((res) => {
        expect(res.body.currentStage).toBe('studies_committee');
      });

    await http(app).get(`/api/cases/${created.id}`).set(auth(tokens.nora)).expect(404);

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(tokens.fahad))
      .field('instruction', INSTRUCTION)
      .expect(201)
      .expect((res) => {
        expect(res.body.currentStage).toBe('technical_office');
      });

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(tokens.hind))
      .field('instruction', INSTRUCTION)
      .expect(201)
      .expect((res) => {
        expect(res.body.currentStage).toBe('chairman');
        expect(res.body.workflowState).toBe('awaiting_chairman');
      });

    const beforeDecision = await http(app)
      .get(`/api/cases/${created.id}`)
      .set(auth(tokens.khalid))
      .expect(200);
    expect(beforeDecision.body.availableActions).toEqual([]);
    expect(beforeDecision.body.availableDecisionTypes).toEqual(
      expect.arrayContaining(['approval', 'archive', 'request_detailed_report']),
    );

    await http(app)
      .post(`/api/cases/${created.id}/decisions`)
      .set(auth(tokens.omar))
      .field('type', 'archive')
      .field('instruction', 'This file should not be archived by the originator.')
      .expect(403);

    const orgDepts = await departments(app, tokens.khalid);
    const legal = orgDepts.find((department) => department.nameEn === 'Legal Affairs');
    expect(legal).toBeDefined();

    await http(app)
      .post(`/api/cases/${created.id}/decisions`)
      .set(auth(tokens.khalid))
      .field('type', 'approval')
      .field('instruction', 'Approved for execution by the concerned departments.')
      .field('departmentIds', legal!.id)
      .expect(201)
      .expect((res) => {
        expect(res.body.workflowState).toBe('in_execution');
        expect(res.body.status).toBe('open');
      });

    const history = await http(app)
      .get(`/api/cases/${created.id}/history`)
      .set(auth(tokens.khalid))
      .expect(200);
    const actions = history.body.map((item: { action: string }) => item.action);
    expect(actions).toEqual(['created', 'forward', 'forward', 'forward', 'decision']);

    const duringExecution = await http(app)
      .get(`/api/cases/${created.id}`)
      .set(auth(tokens.khalid))
      .expect(200);
    expect(duringExecution.body.canComplete).toBe(true);

    await http(app)
      .post(`/api/cases/${created.id}/complete`)
      .set(auth(tokens.omar))
      .send({ note: 'The originator cannot close an endorsed case.' })
      .expect(403);

    await http(app)
      .post(`/api/cases/${created.id}/activities`)
      .set(auth(tokens.admin))
      .send({ comment: 'The concerned department finished the endorsed work.' })
      .expect(201);

    await http(app)
      .post(`/api/cases/${created.id}/complete`)
      .set(auth(tokens.khalid))
      .send({})
      .expect(201)
      .expect((res) => {
        expect(res.body.workflowState).toBe('completed');
        expect(res.body.status).toBe('closed');
        expect(res.body.canComplete).toBe(false);
        expect(res.body.canAddActivity).toBe(false);
      });
  });

  it('returns a file for completion and accepts a resubmit', async () => {
    const created = await createCase(app, tokens.omar, {
      title: 'Returned for missing annexes',
    });

    await http(app)
      .post(`/api/cases/${created.id}/return`)
      .set(auth(tokens.nora))
      .field('instruction', 'Please attach the signed annex and resubmit.')
      .field('returnTo', 'originator')
      .expect(201)
      .expect((res) => {
        expect(res.body.workflowState).toBe('awaiting_info');
        expect(res.body.availableActions).toEqual([]);
      });

    const asOmar = await http(app)
      .get(`/api/cases/${created.id}`)
      .set(auth(tokens.omar))
      .expect(200);
    expect(asOmar.body.availableActions).toEqual(['resubmit']);

    await http(app)
      .post(`/api/cases/${created.id}/resubmit`)
      .set(auth(tokens.fahad))
      .field('instruction', 'Completion notes from the wrong office.')
      .expect(404);

    await http(app)
      .post(`/api/cases/${created.id}/resubmit`)
      .set(auth(tokens.omar))
      .field('instruction', 'The signed annex is attached and ready for review.')
      .expect(201)
      .expect((res) => {
        expect(res.body.workflowState).toBe('in_review');
        expect(res.body.currentStage).toBe('secretariat');
      });
  });

  it('returns a file to the previous office when one exists', async () => {
    const created = await createCase(app, tokens.omar, {
      title: 'Return to previous office',
    });

    await http(app)
      .post(`/api/cases/${created.id}/return`)
      .set(auth(tokens.nora))
      .field('instruction', 'There is no previous office at Secretariat.')
      .field('returnTo', 'previous_stage')
      .expect(400);

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(tokens.nora))
      .field('instruction', 'Please study this file before the next office.')
      .expect(201);

    await http(app)
      .post(`/api/cases/${created.id}/return`)
      .set(auth(tokens.fahad))
      .field('instruction', 'Please re-check the routing note before studies continue.')
      .field('returnTo', 'previous_stage')
      .expect(201)
      .expect((res) => {
        expect(res.body.currentStage).toBe('secretariat');
        expect(res.body.workflowState).toBe('in_review');
      });

    const asNora = await http(app)
      .get(`/api/cases/${created.id}`)
      .set(auth(tokens.nora))
      .expect(200);
    expect(asNora.body.currentStage).toBe('secretariat');
    expect(asNora.body.availableActions).toEqual(['forward', 'return']);
  });

  it('uploads a document on a case the user can access', async () => {
    const created = await createCase(app, tokens.omar, {
      title: 'File with an attached note',
    });

    const uploaded = await http(app)
      .post(`/api/cases/${created.id}/documents`)
      .set(auth(tokens.omar))
      .attach('files', Buffer.from('minutes of the meeting'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(uploaded.body[0].originalFileName).toBe('note.txt');
    expect(uploaded.body[0].watermarkSupported).toBe(true);

    const preview = await http(app)
      .get(`/api/documents/${uploaded.body[0].id}/file`)
      .set(auth(tokens.omar))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(preview.headers['content-type']).toMatch(/pdf/);
    expect(Buffer.from(preview.body).subarray(0, 4).toString()).toBe('%PDF');

    const downloaded = await http(app)
      .get(`/api/documents/${uploaded.body[0].id}/download`)
      .set(auth(tokens.omar))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.headers['content-type']).toMatch(/pdf/);
    expect(downloaded.headers['content-disposition']).toMatch(/note\.pdf/);
    expect(Buffer.from(downloaded.body).subarray(0, 4).toString()).toBe('%PDF');

    const markdown = await http(app)
      .post(`/api/cases/${created.id}/documents`)
      .set(auth(tokens.omar))
      .attach('files', Buffer.from('# Routing note\n\nReturn to Secretariat.'), {
        filename: 'routing.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    expect(markdown.body[0].watermarkSupported).toBe(true);

    await http(app)
      .post(`/api/cases/${created.id}/documents`)
      .set(auth(tokens.fahad))
      .attach('files', Buffer.from('should not attach'), {
        filename: 'blocked.txt',
        contentType: 'text/plain',
      })
      .expect(404);
  });
});
