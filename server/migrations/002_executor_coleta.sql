-- Identifica o processo que executa cada coleta (host:pid), para que a inicialização do servidor
-- só marque como interrompidas as execuções cujo processo de fato não existe mais.
ALTER TABLE coleta_execucoes ADD COLUMN executor text;
