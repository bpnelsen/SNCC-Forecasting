-- Re-run the full classifier on every loan so prior imports pick up the
-- patterns added on this branch — specifically:
--   * "Land Acquisition" / "Land Aquisition" → RAW_LAND
--       (was being absorbed into A&D)
--   * "Memorial Investments"                 → A&D       (was UNKNOWN)
--   * "OTC"                                  → OTC       (was UNKNOWN)
--
-- Includes common misspelling "Aquisition" (missing the c) — frequent in
-- legacy loan-program strings.
--
-- Mirrors src/lib/parser.ts → classifyLoan(). Safe to re-run: the CASE
-- returns the current value for rows that are already correct.
--
-- Note: the `else loan_type` arm preserves existing classification when no
-- rule matches, so we never downgrade a correctly-typed row to UNKNOWN.

update loans
   set loan_type = case
     when lower(coalesce(loan_program, '')) like '%multifamily%'
       or lower(coalesce(loan_program, '')) like '%multi-family%'
       or lower(coalesce(loan_program, '')) like '% mf%'                  then 'MFR'
     when lower(coalesce(loan_program, '')) like '%land acquisition%'
       or lower(coalesce(loan_program, '')) like '%land aquisition%'      then 'RAW_LAND'
     when lower(coalesce(loan_program, '')) like '%raw land%'
       or lower(coalesce(loan_program, '')) like '%raw%'                  then 'RAW_LAND'
     when lower(coalesce(loan_program, '')) like '%memorial investments%' then 'A&D'
     when lower(coalesce(loan_program, '')) like '%acquisition%'
       or lower(coalesce(loan_program, '')) like '%aquisition%'
       or lower(coalesce(loan_program, '')) like '%a&d%'
       or lower(coalesce(loan_program, '')) like '%development loan%'     then 'A&D'
     when lower(coalesce(loan_program, '')) like '%finished lot%'
       or lower(coalesce(loan_program, '')) like '%lot loan%'             then 'FINISHED_LOTS'
     when lower(coalesce(loan_program, '')) like '%otc%'                  then 'OTC'
     when lower(coalesce(loan_program, '')) like '%single family%'
       or lower(coalesce(loan_program, '')) like '%sfr%'
       or lower(coalesce(loan_program, '')) like '%residential construction%'
       or lower(coalesce(loan_program, '')) like '%construction%'         then 'SFR'
     else loan_type
   end;
