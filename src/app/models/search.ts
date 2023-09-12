export interface ISearchValues {
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  with: number;
  budget: number;
}
export class SearchValues implements ISearchValues {
  to: string = "";
  startDate: string = "";
  endDate: string = "";
  with: number = 0;
  budget: number = 0;
  from: string = "";
}
