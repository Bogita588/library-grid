INSERT INTO departments (name, slug, code, description, color)
VALUES
  (
    'Architecture',
    'architecture',
    'ARC',
    'Architectural drawings, concepts, designs, and related documentation.',
    '#2563eb'
  ),
  (
    'Quantity Surveying',
    'quantity-surveying',
    'QS',
    'Quantity surveying, measurements, estimates, valuations, and cost control documents.',
    '#7c3aed'
  )
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    code = EXCLUDED.code,
    description = EXCLUDED.description,
    color = EXCLUDED.color;

DELETE FROM departments d
WHERE d.slug IN ('construction', 'project-management', 'quality-assurance')
  AND NOT EXISTS (
    SELECT 1
    FROM documents doc
    WHERE doc.department_id = d.id
  );
