-- Kalpavruksha Kalyana: fresh MySQL 8.0.16+ / MariaDB 10.6+ schema.
-- Select your Hostinger database in phpMyAdmin, then import this file.
-- Does not drop tables or rewrite existing member data. Use a NEW database.
-- All DATETIME values are UTC. Session data is recreated at cutover.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `mobile_number` VARCHAR(15) NOT NULL,
  `username` VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(10) NOT NULL DEFAULT 'user',
  `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `gender` VARCHAR(10) NULL,
  `deleted_at` DATETIME(6) NULL,
  `failed_login_attempts` INT NOT NULL DEFAULT 0,
  `locked_until` DATETIME(6) NULL,
  locale VARCHAR(2) NULL,
  active_username VARCHAR(50) COLLATE utf8mb4_bin GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN username ELSE NULL END) STORED,
  active_mobile VARCHAR(15) GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN mobile_number ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_active_key (active_username),
  UNIQUE KEY users_mobile_number_active_key (active_mobile),
  CONSTRAINT users_check_1 CHECK (role IN ('user','admin','superadmin')),
  CONSTRAINT users_check_2 CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT users_check_3 CHECK (gender IN ('male','female'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `profiles` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(100) NOT NULL,
  `gender` VARCHAR(10) NOT NULL,
  `image_name` VARCHAR(255) NOT NULL,
  `religion` VARCHAR(100) NOT NULL,
  `caste` VARCHAR(100) NULL,
  
  `subcaste` VARCHAR(100) NULL DEFAULT 'Not Specified',
  `date_of_birth` DATE NOT NULL,
  `time_of_birth` TIME NULL,
  `language` VARCHAR(100) NOT NULL,
  `occupation` VARCHAR(150) NULL,
  `annual_salary` DECIMAL(12,2) NULL,
  `father_name` VARCHAR(100) NOT NULL,
  `father_occupation` VARCHAR(150) NOT NULL,
  `father_salary` DECIMAL(12,2) NULL,
  `mother_name` VARCHAR(100) NOT NULL,
  `mother_occupation` VARCHAR(150) NOT NULL,
  `mother_salary` DECIMAL(12,2) NULL,
  `total_siblings` INT NOT NULL DEFAULT 0,
  `male_siblings` INT NOT NULL DEFAULT 0,
  `female_siblings` INT NOT NULL DEFAULT 0,
  `phone_number` VARCHAR(15) NOT NULL,
  `address` TEXT NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NULL,
  `assets` TEXT NOT NULL,
  `loans` TEXT NULL,
  `rashi` VARCHAR(100) NOT NULL,
  `nakshatra` VARCHAR(100) NOT NULL,
  `jathaka_pdf_name` VARCHAR(255) NULL,
  `created_by` BIGINT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `marital_status` VARCHAR(20) NOT NULL DEFAULT 'never_married',
  `image_name_2` VARCHAR(255) NULL,
  `biodata_pdf_name` VARCHAR(255) NULL,
  `deleted_at` DATETIME(6) NULL,
  `willing_other_caste` VARCHAR(5) NULL,
  `phone_country_code` VARCHAR(6) NOT NULL DEFAULT '+91',
  `religion_other` VARCHAR(100) NULL,
  `caste_other` VARCHAR(100) NULL,
  `has_children` VARCHAR(30) NULL,
  `number_of_children` INT NULL,
  `education` VARCHAR(100) NULL,
  `employed_in` VARCHAR(50) NULL,
  `employed_in_other` VARCHAR(100) NULL,
  `occupation_other` VARCHAR(100) NULL,
  `company_name` VARCHAR(150) NULL,
  `designation` VARCHAR(150) NULL,
  `annual_income_band` VARCHAR(50) NULL,
  `has_dosh` VARCHAR(5) NULL,
  `family_type` VARCHAR(30) NULL,
  `family_values` VARCHAR(30) NULL,
  `family_status` VARCHAR(30) NULL,
  `num_brothers` INT NULL DEFAULT 0,
  `married_brothers` INT NULL DEFAULT 0,
  `num_sisters` INT NULL DEFAULT 0,
  `married_sisters` INT NULL DEFAULT 0,
  `country` VARCHAR(100) NOT NULL DEFAULT 'India',
  `eating_habit` VARCHAR(30) NULL,
  `smoking_habit` VARCHAR(30) NULL,
  `drinking_habit` VARCHAR(30) NULL,
  `mother_tongue` VARCHAR(50) NULL,
  `mother_tongue_other` VARCHAR(50) NULL,
  `birth_place` VARCHAR(150) NULL,
  `user_id` BIGINT NULL,
  active_phone VARCHAR(15) GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN phone_number ELSE NULL END) STORED,
  PRIMARY KEY (id),
  KEY idx_profiles_created_at (created_at, id),
  KEY idx_profiles_education (education),
  KEY idx_profiles_full_name (full_name),
  KEY idx_profiles_marital_status (marital_status),
  KEY idx_profiles_mother_tongue (mother_tongue),
  KEY idx_profiles_user_id (user_id),
  UNIQUE KEY idx_profiles_phone_active (active_phone),
  KEY idx_profiles_name_dob_active (full_name, date_of_birth, deleted_at),
  KEY idx_profiles_feed (deleted_at, gender, created_at, id),
  KEY idx_profiles_dob (date_of_birth),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT profiles_check_1 CHECK (gender IN ('male','female')),
  CONSTRAINT profiles_check_2 CHECK (marital_status IN ('never_married','divorced','widowed','awaiting_divorce','annulled','separated','married')),
  CONSTRAINT profiles_check_3 CHECK (willing_other_caste IN ('yes','no')),
  CONSTRAINT profiles_check_4 CHECK (has_dosh IN ('yes','no')),
  CONSTRAINT profiles_check_5 CHECK (has_children IN ('no','yes_living_with_me','yes_not_living_with_me'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `interests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `profile_id` BIGINT NOT NULL,
  `is_saved_only` BOOLEAN NOT NULL DEFAULT false,
  `is_saved` BOOLEAN NOT NULL DEFAULT false,
  `is_interested` BOOLEAN NOT NULL DEFAULT false,
  `saved_at` DATETIME(6) NULL,
  `interested_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY interests_user_profile_key (user_id, profile_id),
  KEY idx_interests_profile (profile_id),
  KEY idx_interests_saved (user_id,is_saved,saved_at,id),
  KEY idx_interests_interested (user_id,is_interested,interested_at,id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `advertisements` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ad_title` VARCHAR(100) NOT NULL,
  `image_name` VARCHAR(255) NOT NULL,
  `placement` VARCHAR(20) NOT NULL,
  `target_url` VARCHAR(255) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NULL,
  mobile_image_name VARCHAR(255) NULL,
  active_placement VARCHAR(20) GENERATED ALWAYS AS (CASE WHEN is_active = TRUE THEN placement ELSE NULL END) STORED,
  PRIMARY KEY (id),
  KEY idx_advertisements_placement (placement,is_active,expires_at),
  UNIQUE KEY one_active_ad_per_placement (active_placement),
  CONSTRAINT advertisements_check_1 CHECK (placement IN ('top_banner','sidebar','home_middle','home_bottom','after_search'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `success_stories` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `couple_names` VARCHAR(150) NOT NULL,
  `story_text` TEXT NOT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` BIGINT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_success_stories_active (is_active,display_order),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `mobile` VARCHAR(15) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_contact_messages_unread (is_read,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  sess MEDIUMTEXT NOT NULL,
  PRIMARY KEY (sid),
  KEY idx_session_expire (expires),
  CONSTRAINT session_json_check CHECK (JSON_VALID(sess))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Stable rows let transactions serialize even when a placement has no ads.
CREATE TABLE IF NOT EXISTS ad_placements (
  placement VARCHAR(20) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO ad_placements (placement) VALUES
('top_banner'),('sidebar'),('home_middle'),('home_bottom'),('after_search');

-- Upload compensation and retries; only unreferenced objects are removed.
CREATE TABLE IF NOT EXISTS storage_cleanup (
  bucket VARCHAR(20) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  run_after DATETIME(6) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket,filename),
  KEY idx_storage_cleanup_due (run_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
