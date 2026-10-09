# Dunning templates (Italian business tone)

Placeholders in `{{ }}` are filled by code from the ledger and Fatture in Cloud; the dunning agent
may adjust one sentence of tone, never amounts, dates or legal wording. All companies are fictional.

## courtesy_reminder (D+3, email)

Oggetto: Promemoria fattura n. {{number}} del {{date}}

Gentile {{client_name}},

le ricordiamo che la fattura n. {{number}} del {{date}}, di importo {{amount_due}} EUR, è scaduta il
{{due_date}}. Se il pagamento è già stato disposto, la preghiamo di non considerare questo messaggio.

Coordinate per il bonifico: IBAN {{company_iban}}, causale "Fattura {{number}}".

Per qualsiasi chiarimento può rispondere a questa email.

Cordiali saluti,
Ufficio amministrazione – Brezza Sensori S.r.l.

## sollecito (D+15, email)

Oggetto: Sollecito di pagamento – fattura n. {{number}}

Gentile {{client_name}},

dai nostri controlli la fattura n. {{number}} del {{date}} ({{amount_due}} EUR, scadenza {{due_date}})
risulta ancora aperta. Le chiediamo di provvedere al saldo entro 7 giorni o di indicarci la data
prevista di pagamento. Se ci sono contestazioni sulla fornitura, ci scriva: sospenderemo i solleciti
fino alla loro risoluzione.

Cordiali saluti,
Ufficio amministrazione – Brezza Sensori S.r.l.

## formal_notice (D+30, PEC, sent by a person)

Oggetto: Messa in mora – fattura n. {{number}} del {{date}}

Spett.le {{client_legal_name}},

nonostante i precedenti solleciti, la fattura n. {{number}} del {{date}} di {{amount_due}} EUR,
scaduta il {{due_date}}, non risulta saldata. Vi invitiamo a provvedere entro 10 giorni dal
ricevimento della presente. In mancanza, ci riserviamo di applicare gli interessi di mora previsti
dal D.Lgs. 231/2002 e di sospendere le forniture in corso.

Distinti saluti,
{{credit_manager_name}} – Brezza Sensori S.r.l.

## diffida (D+45, PEC, sent by a person)

Oggetto: Diffida ad adempiere – fattura n. {{number}}

Spett.le {{client_legal_name}},

con la presente Vi diffidiamo a corrispondere entro 15 giorni l'importo di {{amount_due}} EUR
relativo alla fattura n. {{number}} del {{date}}. Decorso inutilmente tale termine, affideremo la
pratica al nostro legale per il recupero del credito, con aggravio di spese a Vostro carico. Il
servizio di monitoraggio {{saas_plan}} sarà sospeso dal {{suspension_date}}.

Restiamo disponibili a concordare un piano di rientro.

Distinti saluti,
{{credit_manager_name}} – Brezza Sensori S.r.l.
