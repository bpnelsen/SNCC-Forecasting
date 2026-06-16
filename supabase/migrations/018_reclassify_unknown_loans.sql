-- Reclassify existing UNKNOWN loans by the widened parser rules:
--   * loan_program contains "Land Acquisition"      → RAW_LAND
--   * loan_program contains "Memorial Investments"  → A&D
--   * loan_program contains "OTC"                   → OTC (new loan_type;
--       rolls into the SFR segment for dashboards / charts but keeps its
--       own tag on /loans so analysts can find them)
--   * everything else previously UNKNOWN keeps the program-pattern rules
--     from migration 017.
--
-- Safe to re-run.

update loans
   set loan_type = case
     when lower(coalesce(loan_program, '')) like '%multifamily%'
       or lower(coalesce(loan_program, '')) like '%multi-family%'
       or lower(coalesce(loan_program, '')) like '% mf%'                  then 'MFR'
     when lower(coalesce(loan_program, '')) like '%land acquisition%'    then 'RAW_LAND'
     when lower(coalesce(loan_program, '')) like '%raw land%'
       or lower(coalesce(loan_program, '')) like '%raw%'                  then 'RAW_LAND'
     when lower(coalesce(loan_program, '')) like '%memorial investments%' then 'A&D'
     when lower(coalesce(loan_program, '')) like '%acquisition%'
       or lower(coalesce(loan_program, '')) like '%a&d%'
       or lower(coalesce(loan_program, '')) like '%development loan%'     then 'A&D'
     when lower(coalesce(loan_program, '')) like '%finished lot%'
       or lower(coalesce(loan_program, '')) like '%lot loan%'             then 'FINISHED_LOTS'
     when lower(coalesce(loan_program, '')) like '%otc%'                  then 'OTC'
     when lower(coalesce(loan_program, '')) like '%single family%'
       or lower(coalesce(loan_program, '')) like '%sfr%'
       or lower(coalesce(loan_program, '')) like '%residential construction%'
       or lower(coalesce(loan_program, '')) like '%construction%'         then 'SFR'
     else 'UNKNOWN'
   end
 where loan_type = 'UNKNOWN';
