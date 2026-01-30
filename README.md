# 🚀 Jack Peças - Sistema de Gestão de Inventário

Este projeto é uma solução completa para gerenciamento de estoque e catálogo de peças (focado em displays e baterias). O sistema é composto por um **Painel Administrativo** robusto para controle total do inventário e uma estrutura preparada para alimentar um **Site de Clientes**.

---

## 📋 Índice
* [Visão Geral do Projeto](#-visão-geral-do-projeto)
* [Tecnologias Utilizadas](#-tecnologias-utilizadas)
* [Funcionalidades Principais](#-funcionalidades-principais)
* [Gestão de Mídia (Imagens)](#-gestão-de-mídia-imagens)
* [Como Rodar o Projeto](#-como-rodar-o-projeto)
* [Estrutura de Arquivos](#-estrutura-de-arquivos)

---

## 🔍 Visão Geral do Projeto

O sistema foi desenhado para resolver a complexidade de produtos que possuem múltiplas variações técnicos (atributos) e categorias ramificadas.

### 1. Painel Administrativo (Admin)
* **Gestão de Produtos:** Cadastro completo com SKU, Preço, Estoque e upload de Imagem.
* **Gerenciador de Atributos:** Criação dinâmica de campos (ex: Qualidade, Modelo, Tipo de Tela) que aparecem no cadastro conforme a categoria selecionada.
* **Categorias e Subcategorias:** Organização hierárquica (ex: Telas Displays -> iPhone -> iPhone 13).
* **Dashboard de Estatísticas:** Resumo em tempo real do total de itens e distribuição por categoria.

### 2. Fluxo do Cliente
* **API Dinâmica:** O catálogo de produtos é servido via JSON, permitindo que o site do cliente esteja sempre atualizado com o estoque real.
* **Filtros Inteligentes:** Preparado para filtragem por subcategorias e atributos técnicos.

---

## 🛠 Tecnologias Utilizadas

### **Backend**
* **Node.js & Express:** Framework para a construção da API REST.
* **Multer:** Middleware para processamento de `multipart/form-data` (Upload de fotos).
* **Dotenv:** Proteção de dados sensíveis (E-mail e Senha do Admin).
* **FS (File System) & Path:** Gerenciamento de diretórios e exclusão de arquivos físicos.

### **Frontend (Administrativo)**
* **JavaScript (ES6+):** Manipulação de DOM e requisições assíncronas (`fetch`).
* **Tailwind CSS:** Framework utilitário para uma interface moderna e responsiva.
* **HTML5:** Estrutura semântica dos componentes.

---

## 📸 Gestão de Mídia (Imagens)

O sistema possui uma lógica inteligente de manutenção de arquivos para evitar acúmulo de lixo digital no servidor:

1.  **Upload Automatizado:** As imagens são salvas em `uploads/produtos/` com nomes únicos baseados em `Date.now()` para evitar sobreposição.
2.  **Sincronização na Edição:** Ao atualizar a foto de um produto, o servidor identifica o arquivo antigo e o remove do disco permanentemente antes de salvar o novo.
3.  **Limpeza na Exclusão:** Ao deletar um produto do banco de dados, a imagem vinculada a ele é automaticamente excluída da pasta de uploads.

---

## ⚙️ Como Rodar o Projeto

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/SEU_USUARIO/jack-pecas.git](https://github.com/SEU_USUARIO/jack-pecas.git)
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto:
    ```env
    ADMIN_EMAIL=seu-email@exemplo.com
    ADMIN_PASSWORD=sua-senha-segura
    ```

4.  **Inicie o servidor:**
    ```bash
    node index.js
    ```

5.  **Acesse o sistema:**
    O backend rodará em `http://localhost:3000`.

---

## 📂 Estrutura de Arquivos

```text
├── uploads/             # Pasta física das imagens dos produtos
├── public/              # Interface do Usuário (HTML/JS)
│   ├── js/
│   │   ├── attributes_manager.js  # Gestão de campos dinâmicos
│   │   ├── categories.js         # Gestão de categorias/subcategorias
│   │   └── dashboard.js          # Lógica principal do inventário
│   └── dashboard.html   # HTML do painel administrativo
├── index.js             # API Express com todas as rotas de controle
├── .env                 # Credenciais privadas
├── .gitignore           # Filtro para não enviar node_modules e fotos ao Git
└── package.json         # Manifesto do projeto e dependências