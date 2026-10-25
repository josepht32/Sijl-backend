import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('reference_sequences')
export class ReferenceSequence {
  @PrimaryColumn()
  year: number;

  @Column({ type: 'int' })
  lastValue: number;
}
