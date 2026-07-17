-- A product choice group can either allow several add-ons or exactly one variant.
-- Existing groups retain their current multi-choice behaviour.
alter table public.product_options
  add column if not exists selection_mode text not null default 'multiple'
  check (selection_mode in ('multiple', 'single'));

comment on column public.product_options.selection_mode is
  'multiple permits quantities of each choice; single displays radio choices such as Size or Pizza flavour.';
