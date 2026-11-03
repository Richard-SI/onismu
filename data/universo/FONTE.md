# Universo institucional: universidades brasileiras

## Fonte
- **Conjunto de dados:** INEP – Microdados do Censo da Educação Superior 2024
- **Página oficial:** https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-da-educacao-superior
- **Download:** https://download.inep.gov.br/microdados/microdados_censo_da_educacao_superior_2024.zip (456.807.449 bytes; Last-Modified: 10/07/2026)
- **Arquivo usado:** `dados/MICRODADOS_ED_SUP_IES_2024.CSV` (separador `;`, latin-1, 2.561 IES). O MD5 (`dbe25e67857aa68b12beaeffa194f53f`) confere com o `md5_microdados_ed_superior_2024.txt` do pacote.
- **Dicionário:** `Anexos/ANEXO I - Dicionário de Dados/dicionário_dados_educação_superior.xlsx` (aba Cadastro_IES)
- **Ano de referência:** 2024 (é o mais recente publicado; a URL do zip de 2025 retornou 404 em 22/10/2026)
- **Data do download:** 22/10/2026

## Arquivos
| Arquivo | Linhas (sem cabeçalho) | Conteúdo |
|---|---|---|
| `universidades.csv` | 206 | IES com TP_ORGANIZACAO_ACADEMICA = 1 (Universidade) |
| `outras_ies_excluidas.csv` | 2.355 | Demais IES: 1.897 Faculdades, 417 Centros Universitários, 39 Institutos Federais, 2 CEFETs |

Os dois arquivos estão em UTF-8, separados por vírgula, com as mesmas colunas:
`codigo_emec,nome_oficial,sigla,categoria_administrativa,organizacao_academica,uf,municipio,site_oficial,fonte,ano_referencia,subcategoria`

## Mapeamento das variáveis
| Coluna | Variável INEP |
|---|---|
| codigo_emec | CO_IES (código da IES, o mesmo código usado no e-MEC) |
| nome_oficial | NO_IES |
| sigla | SG_IES |
| categoria_administrativa | TP_CATEGORIA_ADMINISTRATIVA: 1→publica_federal, 2→publica_estadual, 3→publica_municipal, 4→privada_com_fins_lucrativos, 5→privada_sem_fins_lucrativos, 7→especial (os códigos 6, 8 e 9 existiram só em 2009 e não aparecem em 2024) |
| organizacao_academica | TP_ORGANIZACAO_ACADEMICA: 1 Universidade, 2 Centro Universitário, 3 Faculdade, 4 Instituto Federal, 5 CEFET |
| uf | SG_UF_IES |
| municipio | NO_MUNICIPIO_IES ("Município da sede administrativa ou reitoria da IES") |
| site_oficial | (vazio, porque não existe no Censo) |
| subcategoria | IN_COMUNITARIA=1 → `comunitaria`; IN_CONFESSIONAL=1 → `confessional`; as duas juntas aparecem como `comunitaria;confessional` |
| ano_referencia | NU_ANO_CENSO |

## Critérios de filtragem
- Somente TP_ORGANIZACAO_ACADEMICA = 1 (Universidade).
- "Ativa" significa que a IES está no cadastro do Censo 2024. O arquivo de IES do Censo já inclui somente as instituições recenseadas naquele ano; não apliquei nenhum outro filtro. Nenhum CO_IES aparece duas vezes.

## Contagens: universidades.csv (n = 206)
**Por categoria administrativa:**
| Categoria | n |
|---|---|
| publica_federal | 69 |
| privada_sem_fins_lucrativos | 67 |
| publica_estadual | 41 |
| privada_com_fins_lucrativos | 23 |
| especial | 4 |
| publica_municipal | 2 |

Subcategoria, entre as privadas sem fins lucrativos: 20 comunitárias e confessionais, 17 só comunitárias, 1 só confessional.

Categoria "especial" (art. 242 da CF/88, IES criadas por lei estadual ou municipal que cobram mensalidade): UNC (Mafra/SC), USCS (São Caetano do Sul/SP), UNITAU (Taubaté/SP), UnirG (Gurupi/TO). Pública municipal: FURB (Blumenau/SC) e Universidade de Rio Verde (Rio Verde/GO).

**Por UF:**
AC 1 · AL 3 · AM 3 · AP 2 · BA 11 · CE 7 · DF 3 · ES 2 · GO 7 · MA 4 · MG 20 · MS 5 · MT 4 · PA 6 · PB 3 · PE 6 · PI 3 · PR 16 · RJ 17 · RN 4 · RO 1 · RR 2 · RS 21 · SC 13 · SE 2 · SP 36 · TO 4

## Verificações
Estão presentes UFRGS (581), UFPEL (634), FURG (12), UFCSPA (717), UNIPAMPA (5322, sede em Bagé), UFSM (582), UFFS (15121, sede em Chapecó/SC) e UERGS (3336, estadual, Porto Alegre).

## Ressalvas
- **Defasagem do Censo:** os dados se referem a 2024. Uma IES criada, credenciada ou recredenciada como universidade depois de 2024 não está na lista; uma que mudou de organização acadêmica, de nome ou de mantenedora aparece como estava em 2024. Para confirmar a situação atual, consulte o e-MEC (https://emec.mec.gov.br).
- **site_oficial vazio:** o Censo não tem site nem e-mail. Tentei a fonte alternativa (dados abertos do MEC/e-MEC) em 22/10/2026: https://dadosabertos.mec.gov.br/ respondeu HTTP 403 (desafio Cloudflare) e a API https://dados.gov.br/api/publico/conjuntos-dados respondeu HTTP 401. Nenhum domínio foi preenchido por suposição.
- **Município:** é o da sede administrativa ou reitoria, como o Censo informa. Universidades multicampi aparecem apenas pela sede.
- **Nomes:** estão em maiúsculas, como na fonte. Alguns começam com "FUNDAÇÃO" (ex.: FUNDAÇÃO UNIVERSIDADE FEDERAL DO PAMPA - UNIPAMPA).
- **Rede federal:** os Institutos Federais e CEFETs não são universidades e estão em `outras_ies_excluidas.csv`.
