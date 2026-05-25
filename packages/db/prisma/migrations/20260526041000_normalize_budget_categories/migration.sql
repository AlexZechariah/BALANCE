-- Normalize legacy category values so budget and document spend use the same canonical taxonomy.
-- Empty document categories remain NULL; unknown non-empty document categories become "other".
WITH normalized_documents AS (
  SELECT
    id,
    CASE
      WHEN category IS NULL OR btrim(category) = '' THEN NULL
      WHEN regexp_replace(lower(btrim(category)), '[[:space:]-]+', '_', 'g') IN (
        'restaurant',
        'grocery',
        'travel',
        'software',
        'hardware',
        'utilities',
        'transport',
        'medical',
        'education',
        'other'
      ) THEN regexp_replace(lower(btrim(category)), '[[:space:]-]+', '_', 'g')
      ELSE 'other'
    END AS next_category
  FROM "Document"
)
UPDATE "Document" AS document
SET category = normalized_documents.next_category
FROM normalized_documents
WHERE document.id = normalized_documents.id
  AND document.category IS DISTINCT FROM normalized_documents.next_category;

-- Budget rows are only updated where normalization cannot collide with an existing
-- budget for the same user/category/month. Runtime conflict checks prevent new
-- canonical duplicates if legacy duplicate rows already exist.
WITH normalized_budgets AS (
  SELECT
    id,
    "userId",
    month,
    CASE
      WHEN category IS NULL OR btrim(category) = '' THEN 'other'
      WHEN regexp_replace(lower(btrim(category)), '[[:space:]-]+', '_', 'g') IN (
        'restaurant',
        'grocery',
        'travel',
        'software',
        'hardware',
        'utilities',
        'transport',
        'medical',
        'education',
        'other'
      ) THEN regexp_replace(lower(btrim(category)), '[[:space:]-]+', '_', 'g')
      ELSE 'other'
    END AS next_category
  FROM "Budget"
)
UPDATE "Budget" AS budget
SET category = normalized_budgets.next_category
FROM normalized_budgets
WHERE budget.id = normalized_budgets.id
  AND budget.category IS DISTINCT FROM normalized_budgets.next_category
  AND NOT EXISTS (
    SELECT 1
    FROM "Budget" AS existing
    WHERE existing.id <> budget.id
      AND existing."userId" = normalized_budgets."userId"
      AND existing.month = normalized_budgets.month
      AND existing.category = normalized_budgets.next_category
  );
