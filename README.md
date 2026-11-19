# Inspect-AR

Aplicação web local-first para inspeções industriais guiadas por modelo 3D. A interface é responsiva e pode ser executada em desktop, smartphone ou tablet.

## Executar

Sirva esta pasta por HTTP em `localhost` para desenvolvimento no próprio computador ou por HTTPS para abrir em tablets e celulares. `127.0.0.1` no telefone aponta para o telefone, não para o computador. O carregamento do visualizador 3D usa o componente `<model-viewer>` servido por CDN; a primeira abertura requer conexão com a internet. Câmera e AR exigem HTTPS (ou `localhost` no próprio dispositivo), permissão do navegador e suporte da plataforma.

## O que a versão 1 entrega

- Cadastro, edição, duplicação, pesquisa e remoção de modelos, com metadados, plano de inspeção e arquivos GLB/GLTF; a biblioteca e o formulário mostram uma prévia 3D giratória do arquivo carregado.
- Visualização 3D com controles de câmera e entrada em AR nativo em tela cheia: WebXR/Scene Viewer em Android compatível e Quick Look em iOS. O operador posiciona o modelo manualmente; o rastreamento espacial do aparelho mantém a âncora enquanto a sessão AR está ativa.
- Inspeção orientada por checklist configurável por produto, com AR espacial nativo ou alinhamento manual sobre o vídeo da câmera, escala, rotação e transparência.
- Registro de fotos, vídeos anexados ou gravados, capturas e observações; finalização de inspeção com resultado e histórico.
- Exportação CSV do histórico e de um registro individual; relatório individual formatado para impressão ou "Salvar como PDF" do navegador.
- Preferência da planta e identificação manual opcional do responsável por inspeção; não há contas, login ou perfil de usuário.
- Layout adaptável para desktop, tablets em retrato/paisagem e smartphones, com navegação recolhível e controles apropriados para toque.

## Persistência e limites do MVP

Metadados e resultados ficam no `localStorage`; GLB e evidências binárias ficam no `IndexedDB` do navegador. Os dados não são sincronizados nem fazem backup automático. Exportar CSV não inclui os arquivos binários; mantenha cópias externas das evidências importantes.

O AR nativo depende de um arquivo GLB, HTTPS (ou localhost no mesmo dispositivo), permissões e suporte do navegador/dispositivo; em desktop ou dispositivos não compatíveis, permanece disponível o alinhamento manual por câmera. A âncora vale durante a sessão do AR e não é persistida entre sessões. O alinhamento é manual: não há reconhecimento automático da peça, comparação visual ou aviso automático de divergências. O resultado decorre das respostas do checklist. Para inspeção dimensional, o GLB precisa manter escala e unidades corretas do CAD.

## Evolução arquitetural

Para produção, separar a aplicação em módulos de domínio (`Product`, `InspectionPlan`, `Inspection`, `Evidence`, `Finding`), serviços de aplicação (execução de inspeção, captura e relatórios), adaptadores de persistência e provedores externos. Substituir o repositório local por API autenticada e banco relacional (por exemplo, PostgreSQL/Supabase ou SQL Server), mantendo o formato do domínio e migrando os binários para armazenamento de objetos.

Uma integração de visão deve implementar um contrato versionado de análise — imagem/captura e referência como entrada; achados tipados, classe, confiança, localização, desvio, tolerância e versão do modelo como saída. Adaptadores podem conectar Roboflow, Azure AI Vision/Custom Vision, ONNX Runtime Web ou TensorFlow.js. Resultados automáticos devem permanecer assistivos e exigir validação humana até que o processo tenha sido calibrado e validado para cada produto, câmera, tolerância e condição de linha.

Para operação industrial real, acrescentar autenticação e autorização, sincronização offline com resolução de conflitos, trilha de auditoria imutável, política de retenção e backup de evidências, gestão de revisões/aprovações de CAD, tolerâncias dimensionais por característica e testes de aceitação em dispositivos e condições reais de fábrica.
