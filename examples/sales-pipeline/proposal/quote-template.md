# Offerta {{quote_number}}: {{project_title}}

**Per:** {{company_legal_name}}, {{company_address}} · P.IVA {{company_vat}}
**Da:** Ferrovento S.r.l. (fictional), Via dell'Esempio 12, 40121 Bologna · P.IVA 00000000000
**Data:** {{quote_date}} · **Valida fino al:** {{valid_until}} (30 giorni)
**Referente:** {{ae_name}}, {{ae_email}}

## 1. Obiettivo

{{objective}}  <!-- from the scoping doc, in the customer's words (MEDDICC Metrics) -->

## 2. Ambito

| Pacchetto di lavoro | Attività | Giorni | Importo (EUR) |
|---|---|---|---|
{{#work_packages}}
| {{name}} | {{activities}} | {{days}} | {{amount}} |
{{/work_packages}}
| Contingenza (prezzo fisso) | | | {{contingency}} |
| Sconto | {{discount_reason}} | | -{{discount_amount}} |
| **Totale imponibile** | | | **{{total_net}}** |

IVA 22 % esclusa. Trasferte: {{travel_terms}}.

## 3. Assunzioni ed esclusioni

{{assumptions}}
{{exclusions}}

## 4. Tempi

Avvio entro {{start_within_days}} giorni dalla firma. Durata stimata: {{duration_weeks}} settimane.

## 5. Pagamenti

| Evento | Quota | Importo | Termini |
|---|---|---|---|
{{#payment_schedule}}
| {{at}} | {{share}} | {{amount}} | {{terms}} |
{{/payment_schedule}}

Bonifico bancario. Fattura elettronica via SDI (codice destinatario o PEC: {{sdi_code_or_pec}}).

## 6. Condizioni

L'offerta, una volta accettata, è regolata dal contratto quadro di servizi e dal relativo SOW,
inviati per firma elettronica. In caso di discordanza prevale il contratto.

<!-- Approval record (not printed): {{approval_id}} by {{approver}} at {{approved_at}} -->
