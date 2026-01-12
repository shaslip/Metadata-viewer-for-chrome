export interface LogicalUnit {
  id?: number;
  article_id?: number;
  text_content: string;
  author: string;
  unit_type: 'tablet' | 'prayer' | 'talk' | 'history' | 'question' | 'other';
  start_char_index: number; // calculated relative to article body
  end_char_index: number;
  tags: number[]; // Array of tag_ids
}

export interface PageMetadata {
  source_code: string; // 'bw', 'bp'
  source_page_id: number; // wgArticleId
  title: string;
  url: string;
}

export interface UserSession {
  token: string;
  username: string;
  role: string;
}
