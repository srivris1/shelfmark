-- Shelfmark schema. Safe to run on every boot (everything is IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS staff (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'librarian')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS books (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_code        text NOT NULL,             -- ISBN or the library's own accession number
  title            text NOT NULL,
  author           text NOT NULL,
  category         text NOT NULL,
  total_copies     integer NOT NULL CHECK (total_copies BETWEEN 1 AND 1000),
  available_copies integer NOT NULL,
  archived_at      timestamptz,               -- soft delete, keeps old transactions readable
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- the database itself refuses to ever have negative or "extra" copies on the shelf
  CONSTRAINT copies_in_range CHECK (available_copies BETWEEN 0 AND total_copies)
);

-- one live record per code, case-insensitive; archived books free their code up again
CREATE UNIQUE INDEX IF NOT EXISTS books_code_unique ON books (lower(book_code)) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS transactions (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_id          uuid NOT NULL REFERENCES books (id),
  borrower_id      text NOT NULL,             -- registration / employee number
  borrower_name    text NOT NULL,
  borrower_contact text,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  due_at           timestamptz NOT NULL,
  returned_at      timestamptz,
  issued_by        integer REFERENCES staff (id) ON DELETE SET NULL,
  returned_by      integer REFERENCES staff (id) ON DELETE SET NULL,
  CONSTRAINT due_after_issue CHECK (due_at > issued_at),
  CONSTRAINT returned_after_issue CHECK (returned_at IS NULL OR returned_at >= issued_at)
);

-- a borrower can't hold two copies of the same title at once
CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_borrower
  ON transactions (book_id, upper(borrower_id)) WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_open_due ON transactions (due_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_book ON transactions (book_id);
CREATE INDEX IF NOT EXISTS transactions_issued_at ON transactions (issued_at DESC);
