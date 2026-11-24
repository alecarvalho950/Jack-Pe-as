# 🚀 JACK PEÇAS - Sistema Integrado de Inventário e Catálogo Digital

Este projeto nasceu de uma necessidade real de mercado: modernizar a gestão de estoque e a vitrine digital da **JACK PEÇAS**. A solução integra o catálogo de forma automatizada ao ERP **Bling**, substituindo atualizações manuais por sincronização contínua e comunicação em tempo real via WebSockets.

---

## 📸 Demonstração do Sistema

### Catálogo de Produtos (Visão do Cliente)

| Visualização Desktop | Visualização Mobile |
| :---: | :---: |
| <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1783992631/Screenshot_79_ij2far.png" width="800px" /> | <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1783992725/iPhone-13-PRO-jack-pe-as.vercel.app_vyfqpt.webp" width="200px" height="400px" /> |
| <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1783992682/Screenshot_80_rfp8of.png" width="800px" /> | <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1783992746/iPhone-13-PRO-jack-pe-as.vercel.app_1_d72bsr.webp" width="200px" height="400px" /> |

---

## 🔗 Acesse o Projeto
O sistema está publicado e pode ser visualizado nos links abaixo:

* **🛒 Catálogo de Produtos (Frontend):** [https://jack-pe-as.vercel.app/](https://jack-pe-as.vercel.app/)
* **⚙️ API/Backend (Render):** Hospedado em infraestrutura de alta disponibilidade na nuvem.

---

## 🔍 Visão Geral e Impacto no Negócio

Antes deste sistema, a loja dependia de planilhas estáticas e atualizações manuais de catálogo, gerando furos de estoque e lentidão no atendimento aos clientes. 

O projeto foi estruturado para resolver esses gargalos:
* **Integração Centralizada:** O catálogo consome diretamente os dados cadastrados no ERP **Bling**, servindo como um espelho de alta velocidade.
* **Sincronização Instantânea:** Alterações de saldo de estoque, preços ou novos produtos no Bling são refletidas imediatamente na tela do cliente final, eliminando a venda de itens indisponíveis.
* **Foco em Mobile UX:** Um catálogo fluido, focado na experiência móvel, otimizado para que técnicos e compradores localizem peças em poucos segundos diretamente da bancada.

---

## 🛠 Tecnologias Utilizadas e Porquê?

A escolha da *stack* tecnológica priorizou a máxima performance de carregamento e a comunicação em tempo real de forma leve.

### **Frontend (Interface)**
* **JavaScript (ES6+):** Renderização dinâmica e manipulação assíncrona do DOM para criar uma experiência de Single Page Application (SPA).
* **Tailwind CSS:** Fornece um design moderno, limpo e responsivo com baixo consumo de banda, ideal para navegação em redes móveis de celular.
* **Socket.io-client:** Canal ativo de comunicação que aguarda os sinais do servidor para atualizar preços e estoque na tela do usuário instantaneamente.

### **Backend (API)**
* **Node.js & Express:** Arquitetura assíncrona e rápida para gerenciar as rotas da API e as requisições de consulta do catálogo.
* **Socket.io:** Protocolo WebSocket responsável por disparar atualizações em tempo real (push notifications) para todos os clientes conectados sempre que ocorrem alterações no banco.
* **MongoDB Atlas:** Banco de dados NoSQL utilizado para persistir e otimizar as consultas dos produtos sincronizados do Bling, servindo como uma camada de cache de altíssima performance para não sobrecarregar o limite de requisições da API do ERP.
* **JWT (JSON Web Token):** Garante a autenticação segura do painel administrativo privado que auxilia no controle do fluxo de sincronização.

### **Infraestrutura (Cloud)**
* **Vercel:** Hospedagem de alta performance para o Frontend estático.
* **Render:** Hospedagem da API e do servidor WebSocket (Node.js) com suporte a conexões persistentes.

---

## 💡 Funcionalidades Principais & Diferenciais Técnicos

* **Atualização em Tempo Real (Real-time Sync):** Implementação de WebSockets via **Socket.io**. Se o estoque de uma tela de iPhone for zerado no Bling, a informação é transmitida instantaneamente para todos os clientes com o catálogo aberto no celular, sem necessidade de atualizar a página (`F5`).
* **Sincronização Inteligente Bling ERP:** Integração automatizada onde o MongoDB atua como uma réplica otimizada dos dados do Bling, garantindo velocidade extrema de carregamento de dados complexos.
* **Sistema de Ordenação por Disponibilidade de Estoque:** Os produtos ativos são priorizados no topo. Produtos indisponíveis (sem estoque) são movidos de forma automática para o final da lista, mas mantêm internamente a ordenação pelo critério de preço selecionado pelo usuário.
* **Busca Sem Perda de Estado:** O mecanismo de busca em tempo real funciona de forma integrada ao filtro de ordenação, permitindo que o usuário digite termos livremente sem que a ordenação de preço escolhida ("Ordenar por") seja redefinida.
* **Controle de Layout Fluido e Responsivo:** O cabeçalho de categorias e subcategorias adapta-se dinamicamente ao tamanho da tela do dispositivo. Títulos longos contam com truncamento automático (`truncate`) para evitar quebras de layout, e os seletores de ordenação mantêm proporções perfeitas em smartphones de qualquer dimensão.
* **Painel de Apoio à Gestão:** Interface administrativa simples e intuitiva para monitorar o status das sincronizações e configurar atributos específicos do catálogo que auxiliam a venda rápida.

## 📈 Futuro do Projeto

Com a integração de estoque ao Bling consolidada e o **sistema de carrinho com direcionamento regional para o WhatsApp das filiais** totalmente operacional, os próximos passos do roadmap focam em automação transacional e logística:

* **Checkout Automatizado com Gateway de Pagamento:** Evoluir o atual fluxo de carrinho (que hoje envia o pedido pronto para o atendente da filial mais próxima via WhatsApp) para uma finalização de compra 100% autônoma. O objetivo é integrar um gateway de pagamento diretamente ao catálogo, permitindo que o cliente pague e conclua a compra de ponta a ponta, sem a necessidade de intervenção humana ou redirecionamentos externos.
* **Automações de Pós-Venda e Logística:** Integração robusta com grandes marketplaces (como Mercado Livre, Shopee e Amazon) para centralizar a expedição, automatizar a impressão de etiquetas de envio e sincronizar o rastreio logístico de forma unificada.

### 🌟 Diferencial Acadêmico
Este é um projeto **Full Stack** focado em um problema corporativo de integração real. Ele une engenharia de software à infraestrutura de nuvem, demonstrando o domínio de conceitos avançados como bancos de dados NoSQL aplicados para otimização de APIs, consumo de ERPs de mercado (Bling) e arquitetura orientada a eventos em tempo real (WebSockets).

---
Desenvolvido por **Alejandro Carvalho** - 2026