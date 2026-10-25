import { scoreRelatedCases } from './case-similarity';

describe('scoreRelatedCases', () => {
  const source = {
    id: 'current',
    title: 'Legal opinion on the framework agreement with Arab Contractors',
    description: 'رأي قانوني حول بنود الاتفاقية الإطارية مع المقاولون العرب',
    documentText: 'Framework agreement payment schedule Arab Contractors Cairo',
  };

  it('recommends approximately similar cases and skips identical copies', () => {
    const ranked = scoreRelatedCases(source, [
      {
        id: 'similar-contractors',
        title: 'Approved payment schedule to Arab Contractors',
        description: 'جدول دفعات المقاولون العرب المعتمد',
        documentText: 'Payment schedule for Arab Contractors annex',
      },
      {
        id: 'similar-legal',
        title: 'Closed legal opinion on the public procurement circular',
        description: 'رأي قانوني في التعميم الخاص بالمشتريات',
        documentText: 'Legal opinion circular',
      },
      {
        id: 'identical',
        title: source.title,
        description: source.description,
        documentText: 'Unrelated file body',
      },
      {
        id: 'unrelated',
        title: 'Attendance circular for the New Administrative Capital',
        description: 'تعميم الحضور في العاصمة الإدارية الجديدة',
        documentText: 'Staff attendance hours',
      },
    ]);

    const ids = ranked.map((item) => item.case.id);
    expect(ids).toContain('similar-contractors');
    expect(ids).toContain('similar-legal');
    expect(ids).not.toContain('identical');
    expect(ids).not.toContain('unrelated');
    expect(ranked[0].matchedOn.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score);
  });

  it('can match on document content even when titles differ', () => {
    const ranked = scoreRelatedCases(
      {
        id: 'a',
        title: 'Warehouse follow-up',
        description: 'Missing supporting papers',
        documentText:
          'Giza warehouse procurement annexes packing list original invoices',
      },
      [
        {
          id: 'b',
          title: 'Resubmitted Alexandria file',
          description: 'Updated attachments after return',
          documentText:
            'Warehouse procurement annexes packing list original invoices',
        },
      ],
      { minScore: 0.12 },
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].matchedOn).toContain('documents');
  });
});
