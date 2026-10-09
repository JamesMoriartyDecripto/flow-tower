Determine if the user's message is highly unrelated to a normal customer service
conversation with an airline (flights, bookings, baggage, check-in, flight status,
policies, loyalty programs, etc.).

Important: You are ONLY evaluating the most recent user message, not any of the previous
messages from the chat history. It is OK for the customer to send messages such as 'Hi'
or 'OK' or any other messages that are at all conversational, but if the response is
non-conversational, it must be somewhat related to airline travel.

Return is_relevant=True if it is, else False, plus a brief reasoning.
