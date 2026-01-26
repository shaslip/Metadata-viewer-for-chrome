CREATE TABLE IF NOT EXISTS articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_code VARCHAR(10) NOT NULL,   -- 'bw', 'bp', etc.
    source_page_id INT NOT NULL,        -- The MediaWiki Page ID
    title VARCHAR(255) NOT NULL,

    -- Sync Logic (Critical for G5)
    latest_rev_id INT UNSIGNED NOT NULL, 
    is_active TINYINT(1) DEFAULT 1,     
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Access Control (API Gatekeeper)
    -- Default to 'public' so things work, but G5 or Admin can flip to 'restricted'
    copyright_status ENUM('public', 'restricted') DEFAULT 'public',

    -- Composite Unique Key to prevent collisions
    UNIQUE KEY unique_source_page (source_code, source_page_id),
    FOREIGN KEY (source_code) REFERENCES sources(code)
);

-- 3. LOGICAL UNITS (The "Highlighter" Data)
-- This is the primary table populated by the Chrome Extension.
CREATE TABLE IF NOT EXISTS logical_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    article_id INT NOT NULL,

    -- Positioning (The Pointer)
    start_char_index INT NOT NULL,
    end_char_index INT NOT NULL,

    -- Integrity Check (The Checksum)
    text_content MEDIUMTEXT NOT NULL,

    -- Context
    author VARCHAR(255),
    unit_type VARCHAR(50), -- 'tablet', 'prayer', 'talk', 'history', etc.

    -- Multi-Anchor Support
    -- Stores an array of additional anchor points on bahai.org/library documents
    connected_anchors JSON DEFAULT NULL,

    -- Sync Status for G5
    rag_indexed TINYINT(1) DEFAULT 0,  -- 0 = G5 needs to process this
    broken_index TINYINT(1) DEFAULT 0, -- 1 = Indicates an issue with the index pointer

    -- Audit
    created_by INT,

    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES api_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS canonical_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_text TEXT NOT NULL,
    answer_unit_id INT NOT NULL,
    source_book VARCHAR(255),
    created_by INT,
    FOREIGN KEY (answer_unit_id) REFERENCES logical_units(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES api_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. DEFINED TAGS (Taxonomy)
CREATE TABLE IF NOT EXISTS defined_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    parent_id INT,
    description TEXT,
    created_by INT,
    is_official TINYINT(1) DEFAULT 0,
    FOREIGN KEY (parent_id) REFERENCES defined_tags(id),
    FOREIGN KEY (created_by) REFERENCES api_users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_label (label, created_by)
);

-- 5. UNIT TAGS (Many-to-Many)
CREATE TABLE IF NOT EXISTS unit_tags (
    unit_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (unit_id, tag_id),
    FOREIGN KEY (unit_id) REFERENCES logical_units(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES defined_tags(id) ON DELETE CASCADE
);

-- 6. UNIT RELATIONSHIPS (The Knowledge Graph)
-- Links two units, potentially across different pages.
CREATE TABLE IF NOT EXISTS unit_relationships (
    subject_unit_id INT NOT NULL,
    object_unit_id INT NOT NULL,
    relationship_type VARCHAR(50) NOT NULL, -- 'commentary', 'translation', 'refutation'
    weight INT DEFAULT 1,
    created_by INT,

    PRIMARY KEY (subject_unit_id, object_unit_id),
    FOREIGN KEY (subject_unit_id) REFERENCES logical_units(id) ON DELETE CASCADE,
    FOREIGN KEY (object_unit_id) REFERENCES logical_units(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES api_users(id) ON DELETE SET NULL
);

-- 7. CONTENT SEGMENTS (Machine Data / OCR Scores)
-- Populated initially by sync, updated by G5 with noise scores.
CREATE TABLE IF NOT EXISTS content_segments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    article_id INT NOT NULL,
    citation_id VARCHAR(100), -- specific readable ID like 'bw-105-3'

    text_content TEXT,

    -- The Machine Data (Written by G5)
    ocr_noise_score DECIMAL(5, 4) DEFAULT NULL, -- 0.0000 to 1.0000
    classification VARCHAR(50),

    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mw_user_id INT NOT NULL UNIQUE,     -- The MediaWiki User ID (Immutable)
    mw_username VARCHAR(255) NOT NULL,
    role ENUM('user', 'curator', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
