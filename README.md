# Inspect-AR

Aplicação web local-first para inspeções industriais guiadas por modelo 3D. A interface é responsiva e pode ser executada em desktop, smartphone ou tablet.

## Executar

Sirva esta pasta por HTTP em `localhost` (ou HTTPS em um dispositivo da fábrica) e abra `index.html`. Um servidor estático, como a extensão Live Server do VS Code, é suficiente. O carregamento do visualizador 3D usa o componente `<model-viewer>` servido por CDN; a primeira abertura requer conexão com a internet. Câmera e WebXR exigem contexto seguro (`localhost` ou HTTPS) e permissão do navegador.

## O que a versão 1 entrega

- Cadastro, edição, duplicação, pesquisa e remoção de modelos, com metadados, plano de inspeção e arquivos GLB/GLTF; a biblioteca e o formulário mostram uma prévia 3D giratória do arquivo carregado.
- Visualização 3D com controles de câmera e botão para iniciar AR nativo nos modos WebXR, Scene Viewer ou Quick Look, quando compatíveis.
- Inspeção orientada por checklist configurável por produto, com AR espacial nativo ou alinhamento manual sobre o vídeo da câmera, escala, rotação e transparência.
- Registro de fotos, vídeos anexados ou gravados, capturas e observações; finalização de inspeção com resultado e histórico.
- Exportação CSV do histórico e de um registro individual; relatório individual formatado para impressão ou "Salvar como PDF" do navegador.
- Preferência da planta e identificação manual opcional do responsável por inspeção; não há contas, login ou perfil de usuário.
- Layout adaptável para desktop, tablets em retrato/paisagem e smartphones, com navegação recolhível e controles apropriados para toque.

## Persistência e limites do MVP

Metadados e resultados ficam no `localStorage`; GLB e evidências binárias ficam no `IndexedDB` do navegador. Os dados não são sincronizados nem fazem backup automático. Exportar CSV não inclui os arquivos binários; mantenha cópias externas das evidências importantes.

O AR nativo depende de um arquivo GLB, HTTPS (ou localhost), permissões e suporte do navegador/dispositivo; em desktop ou dispositivos não compatíveis, permanece disponível o alinhamento manual por câmera. O posicionamento não é persistido entre sessões e não há registro automático do CAD à peça. A versão 1 não executa inferência de visão computacional e não declara uma peça conforme automaticamente com base em câmera. O resultado decorre das respostas do checklist.

## Evolução arquitetural

Para produção, separar a aplicação em módulos de domínio (`Product`, `InspectionPlan`, `Inspection`, `Evidence`, `Finding`), serviços de aplicação (execução de inspeção, captura e relatórios), adaptadores de persistência e provedores externos. Substituir o repositório local por API autenticada e banco relacional (por exemplo, PostgreSQL/Supabase ou SQL Server), mantendo o formato do domínio e migrando os binários para armazenamento de objetos.

Uma integração de visão deve implementar um contrato versionado de análise — imagem/captura e referência como entrada; achados tipados, classe, confiança, localização, desvio, tolerância e versão do modelo como saída. Adaptadores podem conectar Roboflow, Azure AI Vision/Custom Vision, ONNX Runtime Web ou TensorFlow.js. Resultados automáticos devem permanecer assistivos e exigir validação humana até que o processo tenha sido calibrado e validado para cada produto, câmera, tolerância e condição de linha.

Para operação industrial real, acrescentar autenticação e autorização, sincronização offline com resolução de conflitos, trilha de auditoria imutável, política de retenção e backup de evidências, gestão de revisões/aprovações de CAD, tolerâncias dimensionais por característica e testes de aceitação em dispositivos e condições reais de fábrica.
