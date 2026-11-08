# Plano de conclusão — Nitro Archive Android, iOS e Expo

Data: 2026-11-08. Status: direção aprovada; plano ampliado com os requisitos adicionais de 2026-11-08.
Este arquivo é um inventário de trabalho e critérios de aceite, não uma declaração de suporte já comprovado.

## 1. Objetivo e escopo
Concluir o escopo ZIP/ZIP64 de versão 1 definido em AGENTS.md, com contrato TypeScript único, Swift/Kotlin idiomáticos, segurança por padrão e distribuição OSS verificável. Migrar os projetos nativos do exemplo para React Native 0.88.1 e verificar integração Expo em development builds/prebuild. Não incluir outros formatos, rede, jobs duráveis, filesystem genérico ou publicação automática.

## 2. Abordagem e alternativas
Recomendação: evoluir a implementação existente, usando testes de regressão para fechar cada lacuna. Manter Nitro e interfaces locais de engines/storage; concentrar regras nos responsáveis existentes.
- Reescrita integral: custo e risco desnecessários; perde comportamento já existente.
- Core C++ compartilhado: incompatível com AGENTS.md; C++ permanece bridge gerado/bootstrap.
- Correção incremental com corpus comum: preserva trabalho local e permite demonstrar paridade por operação. É a abordagem proposta.
Decisões delegadas à implementação: nomes privados, organização local e tamanho de buffers, respeitando medições e contratos. Mudanças públicas, mínimos de plataforma e eventual substituição de engine devem ser justificadas no registro de decisões.

## 3. Estado observado e preservação
- Existem alterações locais em package.json, yarn.lock, specs, wrappers TypeScript e Hybrid Objects Android; ByteCounts.kt está removido e NativeTaskHelpers.kt é novo. Inventariar e preservar essas mudanças antes de editar.
- O pacote existente se chama react-native-nitro-archive; AGENTS.md exemplifica @mcodex/react-native-nitro-archive. Resolver documentação e metadados sem renomear o pacote publicado implicitamente.
- Implementação iOS usa SSZipArchive e leitor Objective-C++; não assumir ZIPFoundation apenas porque aparece no layout recomendado. Revisar se o leitor contém comportamento de domínio incompatível com a restrição de C++.
- Android declara Zip4j 2.11.5. Conferir versão estável atual, licença, compatibilidade e mudanças de segurança antes de atualizar.
- Exemplo declara RN 0.88.1, Gradle 9.3.1, Kotlin 2.1.20 e NDK 27.1.12297006. Essas declarações não provam compatibilidade entre si.
- SafeDirectoryOutput iOS faz contenção lexical; isso não prova contenção por componentes contra symlinks.
- SafeDirectoryOutput Android usa canonicalFile, seguido de operações separadas: investigar janela TOCTOU.
- Ambos registram caminhos para rollback sem evidenciar propriedade exclusiva de todos os alvos; testar preservação de saídas preexistentes antes de qualquer mudança.
- tests/parity.test.ts usa mock de capacidades Android: não equivale a conformance nativa.
- Há scripts de verificação de geração e pacote e workflows Android/iOS. Revisar cobertura e execução efetiva.

## 4. Inventário e arquitetura
- [ ] Ler todos os arquivos próprios de src, ios, android, example, contracts, tests, scripts e .github; excluir dependências e tratar gerados como infraestrutura.
- [ ] Mapear exportação pública → wrapper → spec → código gerado → Hybrid Object → caso de uso → engine/storage, incluindo chamadores, testes e fixtures.
- [ ] Montar matriz por operação e plataforma: implementado, parcial, ausente e comprovado.
- [ ] Revisar lazy initialization, imports sem efeitos, erros estruturados, bigint, defaults e limites.
- [ ] Aplicar Readable Clean Code, DRY/KISS/SRP/SOLID/DDD e Codebase Design onde reduzem complexidade real; evitar interfaces vazias, forwarding e reorganização cosmética geral.
- [ ] Identificar a skill pretendida por “mattcock”; não inventar instruções de skill indisponível.

## 5. Segurança — prioridade P0
Usar TDD: fixture/teste falhando, correção no responsável, teste passando nas duas plataformas.
- [ ] Traversal, caminhos absolutos POSIX/Windows/UNC/URI, separadores mistos, NUL, Unicode, colisões por normalização/case e diretórios implícitos.
- [ ] Symlinks em entradas, raiz e componentes preexistentes; impedir escapes e trocas concorrentes. preserve-safe indisponível até implementação resistente em ambas.
- [ ] Special files, duplicatas, conflito arquivo/diretório e todas as políticas overwrite.
- [ ] Rollback remove apenas recursos pertencentes à operação; falha/cancelamento preserva dados anteriores. Testar arquivos e diretórios existentes, backups e restauração.
- [ ] Limites de entries, bytes totais e por entrada, ratio, profundidade e comprimento; impor também aos bytes efetivamente escritos.
- [ ] Overflow, tamanhos truncados, ZIP64, central directory inválido, métodos não suportados, CRC e arquivos corrompidos.
- [ ] Buffers JS copiados antes da retenção assíncrona; memória e temporários limitados; nenhuma exposição de senha em logs/erros.
- [ ] Falhas de disco, provider, permissões revogadas, cancelamento e cleanup; não engolir falhas relevantes.
- [ ] Nenhuma permissão ampla, picker implícito, unsafe global ou erro inferido por texto.

## 6. Contrato e operações ZIP
- [ ] Detecção por conteúdo e capacidades honestas.
- [ ] Open/list paginação e filtros, lookup normalizado exato, metadata e leitura limitada de ArrayBuffer.
- [ ] Criação com arquivos, diretórios, URIs e buffers; store/deflate, profiles e storeAlreadyCompressed.
- [ ] Extração completa/seletiva, entries versus include, exclude, glob semantics e políticas de duplicata/overwrite.
- [ ] Validação com CRC e corpus interoperável de terceiros; ler/criar ZIP64 sem carregar todo o conteúdo.
- [ ] Estados single-use, cancel antes/durante/finalização, dispose, concorrência, listeners isolados, progress monotônico e throttle.
- [ ] Encriptação somente se houver interoperabilidade e segurança comprovadas nas duas plataformas; caso contrário retirar a capacidade de v1 e retornar erro estável.
- [ ] Atualizar TS/JSDoc/contratos antes dos specs; regenerar Nitrogen; nunca editar gerados manualmente.

## 7. Storage e acesso
- [ ] Android: paths privados, content URI seekable/não seekable, spool limitado, grants transitórios/persistidos/revogados e saída de documento.
- [ ] Android tree URI: capacidades do provider, criação, falhas parciais, rename/replace e atomicidade reportada sem promessas indevidas.
- [ ] iOS: paths/file URLs, security scope auto/required/disabled com aquisição e liberação balanceadas, NSFileCoordinator e ciclo de vida de reader/tasks.
- [ ] Preflight consultivo, recuperação acionável, revalidação no uso, disk capacity e limpeza determinística.
- [ ] Host app controla picker e permissões; documentar essa responsabilidade.

## 8. RN 0.88.1 e dependências nativas
- [ ] Consultar Context7 e template/Upgrade Helper correspondente à versão exata; não copiar defaults de outra versão.
- [ ] Comparar settings/build Gradle, wrapper, AGP, Kotlin, JDK, NDK/CMake, SDKs, properties, manifests, ProGuard/R8, MainApplication/MainActivity e autolinking.
- [ ] Comparar Podfile, podspec, deployment target, Xcode project/build settings, AppDelegate/ReactNativeDelegate, privacy manifest e Swift/C++ interop.
- [ ] Verificar Nitro/Nitrogen 0.37.2 e código gerado contra as alterações locais.
- [ ] Consultar releases atuais SSZipArchive/minizip e Zip4j em fontes oficiais; escolher a última estável compatível, fixar versão e registrar licenças/mínimos.
- [ ] Caso engine atual não satisfaça requisitos, registrar avaliação antes de substituir por outra; não migrar por estética.
- [ ] Builds Android debug/release com R8 e iOS debug/release; executar testes nativos em emulador/simulador e casos de acesso em ambiente adequado.

## 9. Expo
- [ ] Verificar SDK Expo cuja versão React Native seja compatível; não assumir suporte a RN 0.88.1 em SDK arbitrário.
- [ ] Usar development build/prebuild para código nativo; Expo Go padrão não carrega este módulo customizado.
- [ ] Instalar tarball real em app Expo limpo e verificar autolinking de Nitro/pods/Gradle.
- [ ] Criar config plugin apenas se uma configuração necessária não for resolvida por autolinking; não adicionar plugin vazio.
- [ ] Testar open/create/extract/validate, cancel/progress, buffers e acesso por picker do host.
- [ ] Repetir prebuild para verificar idempotência; verificar builds debug/release Android/iOS.
- [ ] Documentar SDK/RN/Nitro testados, comandos e limitações reais; incluir gate CI apropriado.

## 10. Complexidade e desempenho
- [ ] Localizar scans repetidos, buscas O(n²), compilação repetida de globs, retenção integral de entradas/bytes e callbacks excessivos.
- [ ] Usar índices/maps quando corrigem buscas repetidas; medir custo de memória e preservação de ordenação/duplicatas.
- [ ] Streaming, paginação e buffers limitados; medir arquivos grandes e arquivos com muitas entradas.
- [ ] Recursão apenas com profundidade limitada e sem seguir links inseguros; preferir iteração para profundidade controlada por ZIP externo.
- [ ] Hoisting não é meta de desempenho. Não atribuir ganho a mudanças sintáticas sem medição.
- [ ] Registrar baseline e resultado de tempo, memória e tamanho JS/tarball/binários; manter apenas otimizações demonstradas.

## 11. Testes, empacotamento e CI
- [ ] Baseline typecheck, formatter/lint e Jest com relatório de falhas existentes separado de regressões.
- [ ] Suites reais Swift/Kotlin usando o mesmo manifesto e expected results; mocks TS não substituem testes nativos.
- [ ] Fixtures pequenas hostis e testes de integração: traversal, links, bombs, CRC, overflow, duplicatas, rollback, grants e cancelamento.
- [ ] Compiler React habilitado/desabilitado para hooks opcionais, lazy core, listeners e dispose.
- [ ] TS exports/JSDoc, ESM/CJS, subpaths exatos, React Compiler target/runtime, peers e ausência de imports internos publicados indevidamente.
- [ ] Gerados atuais, paridade de contratos, tarball real, consumer bare e consumer Expo limpos.
- [ ] Gate CI debug/release, R8/dead stripping, dependências/licenças e budgets de tamanho.
- [ ] Toda falha encontrada vira item rastreável nesta matriz; não suprimir teste ou reduzir proteção para passar.

## 12. Documentação OSS
- [ ] README em inglês enxuto, editado com Humanizer: poucos emojis, badges reais, instalação, compatibilidade, open/list/extract e create.
- [ ] Cancellation/progress, ArchiveError, limites/defaults, encryption, capabilities e lifecycle.
- [ ] Expo development build, SAF/persistência/revogação, iOS scoped URLs e permissões com exemplos corretos.
- [ ] Distribuir detalhes em docs com links relativos: troubleshooting, migration, arquitetura, benchmarks, segurança e matriz de compatibilidade.
- [ ] SECURITY/disclosure, CONTRIBUTING, LICENSE/third-party notices, CHANGELOG e metadados consistentes.
- [ ] Não publicar badges, benchmarks, suporte ou “100%” sem evidência correspondente.

## 13. Sequência de execução
1. Direção aprovada pelo usuário; garantir escrita autorizada na raiz e executar os gates abaixo.
2. Concluir inventário arquivo a arquivo e baseline; atualizar matriz sem sobrescrever trabalho local.
3. Corrigir P0 segurança com testes antes da implementação.
4. Fechar contrato e operações ZIP em slices pareados Swift/Kotlin.
5. Finalizar storage externo, cancelamento e lifecycle.
6. Migrar nativos RN e atualizar engines, regenerando bridge quando necessário.
7. Validar consumidores bare e Expo por tarball e builds.
8. Medir complexidade/tamanho, revisar documentação e completar CI.
9. Revisar diff final e publicar relatório de evidências; publicação npm depende de autorização própria.

## 14. Critérios de conclusão
Cada requisito do AGENTS.md precisa de evidência: arquivo responsável, teste, resultado e plataforma.
Separar: análise estática; testes TS; testes nativos; builds debug/release; runtime local; acesso real a providers; Expo; CI.
A biblioteca só será declarada concluída quando todos os gates aplicáveis passarem. Ausência de dispositivo, provider, SDK ou toolchain é pendência explícita, nunca aprovação presumida.
Este plano foi escrito após revisão inicial dos pontos acima; auditoria integral e implementação ainda não concluídas.

## 15. Revisão aprovada e ampliação de escopo
O usuário aprovou a direção do plano e solicitou os itens abaixo em 2026-11-08. Não reabrir aprovação do desenho para decisões rotineiras já cobertas. A avaliação de formatos adicionais está autorizada; sua entrega como recurso público depende dos gates de paridade, segurança e tamanho. O primeiro release permanece ZIP-focused conforme AGENTS.md.

### 15.1 TypeScript 7 e bundle final
TypeScript verifica tipos e emite código/declarations; tree-shaking é responsabilidade do bundler consumidor, não um recurso automaticamente ativado pela versão 7.
Estado observado: package.json declara typescript ^7.0.2, sideEffects: false, ESM/CJS e subpaths; tsconfig preserva módulos ESNext e verbatimModuleSyntax. Verificar a versão efetivamente instalada e a integração do compilador com Bob/Nitrogen antes de alterar configuração.
- [ ] Confirmar toolchain TypeScript 7 real, binário usado por typecheck/declarations e compatibilidade de ferramentas. Não adicionar outro compilador por nome ou promessa de velocidade.
- [ ] Inspecionar output de Bob: preservar ESM, imports/exports type-only, comentários JSDoc, declaration maps úteis e ausência de runtime TS desnecessário.
- [ ] Revisar sideEffects: false contra todos os imports reais; a declaração não pode ocultar registros ou efeitos necessários.
- [ ] Verificar core versus ./react: consumidor imperativo não deve reter hooks, React Compiler runtime ou inicialização antecipada do Hybrid Object.
- [ ] Medir cenários de consumidor: somente tipos; somente fileSource; openArchive; createArchive; uso de ./react; pacote sem import como baseline.
- [ ] Produzir bundles release reais de Metro/RN e Expo usando versões/configurações suportadas e um fixture rápido com bundler ESM. Não assumir que todos fazem a mesma eliminação.
- [ ] Registrar tamanho bruto e comprimido dos artefatos JS com versão/configuração de ferramenta; não confundir gzip de comparação com transferência/runtime Hermes.
- [ ] Inspecionar módulos retidos, source maps/relatórios e delta contra baseline; medir separadamente tarball, bytecode Hermes, APK/AAB e produto iOS.
- [ ] Exercitar imports root e subpaths no tarball publicado; corrigir exports/build preservando compatibilidade. Não remover CJS sem motivo e decisão de compatibilidade.
- [ ] Gate de tamanho reproduzível e sem regressões inexplicadas. Não adicionar anotações PURE, minificação de biblioteca ou empacotador novo sem necessidade demonstrada.

### 15.2 Aplicação do PR #696 — Kotlin integrado ao AGP
Fonte verificada ao vivo: https://github.com/mCodex/react-native-sensitive-info/pull/696
Título: fix(android): skip explicit Kotlin plugin when AGP registers the kotlin extension. Estado: MERGED.
O diff altera android/build.gradle para aplicar org.jetbrains.kotlin.android somente quando project.extensions.findByName('kotlin') == null. A mudança evita registro duplicado da extensão em ambiente com Kotlin integrado ao AGP; não é mudança de API de arquivos nem otimização de bundle.
Estado local: android/build.gradle da biblioteca ainda aplica o plugin Kotlin incondicionalmente e declara AGP 8.8.0 no buildscript.
- [ ] Adaptar a detecção por extensão no responsável local, sem copiar autolinking ou nomes do Sensitive Info.
- [ ] Verificar a versão efetivamente resolvida de AGP no host, Kotlin integrado, ordem de aplicação dos plugins e opções de migração; não concluir compatibilidade apenas pelo wrapper Gradle.
- [ ] Revisar DSL kotlinOptions/compilerOptions, sourceSets, targets JVM, kapt/KSP se presentes, flags temporárias e scripts gerados Nitro.
- [ ] Validar fallback com Kotlin plugin externo em AGP 8 e configuração com Kotlin integrado em AGP 9, em combinações compatíveis com o RN consumidor.
- [ ] Executar configuração, compile Kotlin, link nativo e release/R8; incluir fixture consumidor para provar ausência de registro duplicado.
- [ ] Revisar se buildscript fixa AGP indevidamente em biblioteca consumida por host; alinhar resolução ao contrato de compatibilidade sem atualização isolada de tooling.
- [ ] Documentar matriz atual comprovada. Preparação para próximas versões significa evitar aplicação duplicada e preservar fallback; não prometer suporte a versões ainda não testadas.

### 15.3 Estudo de formatos adicionais
Objetivo: avaliar robustez multiplataforma sem enfraquecer ZIP. Este item é pesquisa e decisão documentada, não habilitação automática de formatos em ArchiveFormat.
- [ ] Separar operações por formato: detectar, listar, ler entrada, validar, extrair e criar; verificar streaming, seek, glob e acesso URI.
- [ ] TAR: avaliar leitura/criação e semântica de links, hardlinks, sparse files, PAX/GNU metadata, special files, encoding e tamanhos.
- [ ] TAR.GZ/TGZ: avaliar composição TAR + gzip, CRC, expansão em múltiplas camadas, orçamento total e necessidade de spool limitado. gzip sozinho representa um stream, não uma lista de arquivos.
- [ ] RAR: avaliar somente leitura/extração inicialmente; verificar versões, solid archives, volumes, criptografia e restrições de licença/redistribuição. Não prometer criação RAR.
- [ ] Outros formatos: comparar apenas se houver engine estável, mantido, compatível com ambas as plataformas e benefício concreto.
- [ ] Comparar recursos de engines existentes e candidatos em fontes oficiais; matriz com licença, manutenção/CVEs, ZIP64, mínimo OS, suporte a arm64/simulador e custo de integração.
- [ ] Respeitar Swift/Kotlin como donos das regras. Dependência nativa não autoriza introduzir core C++ de domínio ou lógica de formato no bridge. Caso uma opção dependa disso, registrar incompatibilidade e não incorporá-la silenciosamente.
- [ ] Estimar tamanho JS e nativo por arquitetura, custo de build, memória, seek/spool e complexidade; verificar se formatos opcionais realmente seriam removidos pelo linker. Tree-shaking JS não remove automaticamente engines nativos.
- [ ] Todos os formatos devem obedecer aos mesmos limites, contenção de caminhos, erros, cancelamento e rollback. Bloquear links e tipos especiais sem proteção comprovada.
- [ ] Criar corpus interoperável e malicioso por formato antes de anunciar suporte; capabilities nunca devem indicar suporte inferido apenas por extensão.
- [ ] Registrar decisão em documento de viabilidade: adotar agora somente se não atrasar os gates ZIP nem ampliar riscos; caso contrário propor versão posterior ou pacote separado. Atualizar AGENTS.md/contrato se um escopo público novo for efetivamente aprovado.

### 15.4 JSDoc, tipos e experiência na IDE
- [ ] Auditar todos os símbolos públicos root/subpaths, tipos e propriedades; inglês claro, descrições curtas e terminologia consistente.
- [ ] Explicar formato/unidade de cada valor relevante, bigint, limites/defaults, nullability, diferenças de plataforma, erros e ciclo de vida.
- [ ] Usar @param, @returns, @throws, @remarks, @example, @see e links de tipos onde ajudam. Não repetir assinatura nem inventar tags de validação que o runtime não executa.
- [ ] Exemplos reais para sources/destinations, open/list/read/extract/validate/create, include/exclude, progress, cancel/dispose, capabilities e recuperação de acesso.
- [ ] Precisão de unions/literais e inferência: autocomplete deve apresentar opções válidas, defaults, narrowing e resultados sem casts ou acesso a módulos internos.
- [ ] Compilar exemplos contra tarball para imports root e subpaths; fixtures positivas e negativas para erros de uso e inferência.
- [ ] Inspecionar .d.ts final: comentários preservados, links resolvíveis, ausência de tipos privados de Nitro e maps apontando para arquivos publicados.
- [ ] Verificar hover, signature help, auto-import e go-to-definition em IDE suportada. Relatar separadamente validação automática e inspeção manual.
- [ ] Melhorar KDoc/Swift doc comments para ownership, concorrência e recursos. Humanizer para prosa pública e README; docs de uso seguem writing-user-docs.
- [ ] Gerar referência de API usando infraestrutura existente ou ferramenta justificada; manter README enxuto e exemplos longos em docs.

### 15.5 Nitro Modules — desempenho e manutenção atual
Fontes primárias: https://nitro.margelo.com/ e documentação corrente consultada via Context7. Tratar recomendações da comunidade como hipóteses a verificar, nunca como substitutas do contrato ou dos testes.
- [ ] Conferir mudanças de versão Nitro/Nitrogen, requisitos RN/Swift/Kotlin/AGP e issues upstream antes de cada atualização. Não aplicar patches Swift/C++ privados para mascarar falha upstream sem evidência e justificativa.
- [ ] Um root Hybrid Object autolinkado e lazy; readers/tasks criados por factories. Importar helpers/tipos não instancia o root.
- [ ] Ownership de ArrayBuffer: buffer JS não proprietário é copiado antes de reter/usar de modo assíncrono; buffers nativos proprietários só usam caminho sem cópia quando há garantia de lifetime.
- [ ] Promise não prova offload: confirmar que scan/CRC/compressão/traversal/spool estão fora da JS thread e MainActor/UI thread. Revisar scheduler, coroutines e cancelamento estruturado.
- [ ] Manter getters síncronos apenas para snapshots já disponíveis; avaliar serialização e custo de listEntries/progress.
- [ ] Coalescer callbacks por task, evitar reentrada/retain cycles, remover listeners e impedir chamadas tardias após dispose.
- [ ] Revisar corridas entre start/cancel/dispose/fechamento de reader; sincronização e lifetime dos recursos nativos, sem GlobalScope ou @unchecked Sendable injustificado.
- [ ] Limitar cruzamentos JSI/JNI e alocações por chunk usando payloads/paginação existentes; medir latência, frequência e memória antes de alterar interface.
- [ ] Regenerar ponte de modo determinístico, verificar registro/autolinking e testar release/R8/dead stripping; não editar gerados.
- [ ] Manter diagnóstico de falhas upstream separado das falhas da biblioteca e documentar a combinação de versões testada, sem extrapolar compatibilidade futura.

### 15.6 Aceite dos novos itens
Entregáveis: matriz de bundles com baseline/delta; evidência AGP 8/9 compatível; relatório de formatos; exemplos JSDoc compilados e declarations inspecionadas; checklist Nitro com testes de ownership/threading/lifecycle.
Não declarar formato, otimização, compatibilidade futura ou experiência de IDE como comprovados por apenas typecheck ou mocks.

## 16. Evidências do planejamento
- Plano original revisado por agente independente: nenhuma questão importante restante para orientar execução; revisão documental, sem prova de produto.
- Tentativa inicial Jest bloqueada por acesso Watchman; execução com --watchman=false chegou à configuração e falhou nas nove suítes por ausência de @react-native/babel-preset. Zero testes executados. Corrigir baseline antes de interpretar regressões.
- PR #696 e diff consultados com gh nesta revisão; adaptação planejada, ainda não aplicada.
- Documentação Context7 consultada para TypeScript, AGP e Nitro; versões/mínimos e recomendações específicas ainda devem ser cruzados com toolchain instalada e releases oficiais.
