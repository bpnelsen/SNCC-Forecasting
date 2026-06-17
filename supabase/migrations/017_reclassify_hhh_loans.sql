-- Reclassify any imported loans currently typed HHH or UNKNOWN by their
-- loan_program text, mirroring src/lib/parser.ts → classifyLoan(). Borrower-
-- name overrides are no longer part of classification; HHH/JV is sourced
-- strictly from the manual /hhh-jv tab.
--
-- Safe to re-run: rows already matching the program-based type are unchanged.

update loans
   set loan_type = case
     when lower(coalesce(loan_program, '')) like '%multifamily%'
       or lower(coalesce(loan_program, '')) like '%multi-family%'
       or lower(coalesce(loan_program, '')) like '% mf%'                  then 'MFR'
     when lower(coalesce(loan_program, '')) like '%raw land%'
       or lower(coalesce(loan_program, '')) like '%raw%'                  then 'RAW_LAND'
     when lower(coalesce(loan_program, '')) like '%acquisition%'
       or lower(coalesce(loan_program, '')) like '%a&d%'
       or lower(coalesce(loan_program, '')) like '%development loan%'     then 'A&D'
     when lower(coalesce(loan_program, '')) like '%finished lot%'
       or lower(coalesce(loan_program, '')) like '%lot loan%'             then 'FINISHED_LOTS'
     when lower(coalesce(loan_program, '')) like '%single family%'
       or lower(coalesce(loan_program, '')) like '%sfr%'
       or lower(coalesce(loan_program, '')) like '%residential construction%'
       or lower(coalesce(loan_program, '')) like '%construction%'         then 'SFR'
     else 'UNKNOWN'
   end
 where loan_type in ('HHH', 'UNKNOWN');
