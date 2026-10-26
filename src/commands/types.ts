/** Argument shapes shared by the command modules. */

export interface RootArgs {
  root?: string;
}

export interface InitArgs extends RootArgs {
  id?: string;
  name?: string;
  prefix?: string;
  owner?: string;
  summary?: string;
  force?: boolean;
}

export interface ListArgs extends RootArgs {
  type?: string;
  status?: string;
}

export interface SearchArgs extends RootArgs {
  query: string;
  limit?: number;
}

export interface ShowArgs extends RootArgs {
  id: string;
}

export interface NewArgs extends RootArgs {
  type: string;
  status: string;
  title: string;
  summary?: string;
  slug?: string;
  owner?: string;
  related?: string;
  parent?: string;
  issue?: string;
  design?: string;
  activationTrigger?: string;
  commit?: string[];
}

export interface IndexArgs extends RootArgs {
  check?: boolean;
}

export interface StaleArgs extends RootArgs {
  days?: number;
}

export interface ArchiveArgs extends RootArgs {
  id: string;
  by: string;
}

export interface InstallSkillArgs {
  repo?: string;
  force?: boolean;
}
