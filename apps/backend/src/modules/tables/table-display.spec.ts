import { tableDisplay } from './tables.service';

const order = (kots: number, printed = false) => ({
  billPrintedAt: printed ? new Date() : null,
  _count: { kots },
});

describe('table colour on the floor', () => {
  it('follows the table through a meal', () => {
    expect(tableDisplay({ status: 'AVAILABLE' }, [], false)).toBe('BLANK');
    expect(tableDisplay({ status: 'OCCUPIED' }, [order(0)], false)).toBe(
      'RUNNING',
    );
    expect(tableDisplay({ status: 'OCCUPIED' }, [order(2)], false)).toBe(
      'RUNNING_KOT',
    );
    expect(tableDisplay({ status: 'OCCUPIED' }, [order(2, true)], false)).toBe(
      'PRINTED',
    );
    expect(tableDisplay({ status: 'OCCUPIED' }, [], true)).toBe('PAID');
  });

  it('a second unprinted bill keeps the table running', () => {
    expect(
      tableDisplay({ status: 'OCCUPIED' }, [order(1, true), order(1)], false),
    ).toBe('RUNNING_KOT');
  });

  it("the table's own status wins where it should", () => {
    expect(tableDisplay({ status: 'CLEANING' }, [order(1)], false)).toBe(
      'CLEANING',
    );
    expect(tableDisplay({ status: 'OUT_OF_SERVICE' }, [], false)).toBe(
      'OUT_OF_SERVICE',
    );
    expect(tableDisplay({ status: 'RESERVED' }, [], false)).toBe('RESERVED');
    expect(tableDisplay({ status: 'OCCUPIED' }, [], false)).toBe('RUNNING');
  });
});
