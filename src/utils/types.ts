export interface LogicalUnit {
  id?: number;
  article_id?: number;
  text_content: string;
  author: string;
  unit_type: 'tablet' | 'prayer' | 'talk' | 'history' | 'canonical_answer' | 'other' | 'link_subject' | 'link_object' | 'user_highlight';
  start_char_index: number; 
  end_char_index: number;
  tags: (number | string)[]; 
  source_code?: string;
  source_page_id?: number;
  connected_anchors?: (number | string)[];
  title?: string;
  created_by?: number;
  broken_index?: number;
}

export interface PageMetadata {
  source_code: string; 
  source_page_id: number; 
  latest_rev_id: number;
  title: string;
  author?: string;
  url: string;
}

export interface UserSession {
  token: string;
  username: string;
  role: string;
}

export interface UnitRelationship {
  subject_unit_id: number;
  object_unit_id: number;
  relationship_type: 'commentary' | 'translation' | 'refutation' | 'allusion';
  weight: number;
}

export interface DefinedTag {
  id: number;
  label: string;
  parent_id?: number;
  description?: string;
  created_by?: number;
  is_official?: boolean | number;
}

export type StagedItem = 
  | { type: 'existing', unit: LogicalUnit }
  | { type: 'new', text: string, offsets: { start: number, end: number }, context: PageMetadata };
