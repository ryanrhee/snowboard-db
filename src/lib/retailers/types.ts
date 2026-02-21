import { RawBoard, SearchConstraints, Region } from "../types";

export interface RetailerModule {
  name: string;
  region: Region;
  baseUrl: string;
  searchBoards(constraints: SearchConstraints): Promise<RawBoard[]>;
}
