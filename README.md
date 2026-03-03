# 🚀 Jack Peças - Sistema Integrado de Inventário e Catálogo Digital

Este projeto nasceu de uma necessidade real de mercado: modernizar a gestão de estoque e a vitrine digital da **Jack Peças**. A solução substitui processos manuais e custos com plataformas de terceiros por um sistema personalizado, escalável e de alto desempenho.

---

## 📸 Demonstração do Sistema

### Catálogo de Produtos (Visão do Cliente)

| Visualização Desktop | Visualização Mobile |
| :---: | :---: |
| <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1772578043/Pagina_inicial_-_Jack_Pe%C3%A7as_1_jac4xf.png" width="800px" /> | <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1772578264/Catalogo_de_produtos_1_cni2vw.jpg" width="200px" height="400px" /> |
| <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1772578043/Pagina_inicial_-_Jack_Pe%C3%A7as_2_hddzxq.png" width="800px" /> | <img src="https://res.cloudinary.com/drdu6ryip/image/upload/v1772578264/Catalogo_de_produtos_3_tcaqsg.jpg" width="200px" height="400px" /> |


---

## 🔗 Acesse o Projeto
O sistema está publicado e pode ser visualizado nos links abaixo:

* **🛒 Catálogo de Produtos (Frontend):** [https://jack-pe-as.vercel.app/](https://jack-pe-as.vercel.app/)
* **⚙️ API/Backend (Railway):** Hospedado em infraestrutura de alta disponibilidade.

---

## 🔍 Visão Geral e Impacto no Negócio

Antes deste sistema, a loja dependia de tabelas estáticas e gerenciadores de catálogo externos, o que dificultava a visualização dos produtos via mobile e gerava insatisfação do cliente. 

O projeto foi desenvolvido para entregar:
* **Independência Tecnológica:** Redução imediata de custos com plataformas de terceiros (*SaaS*).
* **Experiência do Usuário (UX):** Um catálogo fluido, focado em dispositivos móveis, para que o cliente encontre a peça certa em segundos.
* **Gestão Dinâmica:** Um painel administrativo que permite o controle total de atributos técnicos, categorias e subcategorias de forma personalizada.

---

## 🛠 Tecnologias Utilizadas e Porquê?

A escolha da *stack* tecnológica foi pensada para garantir um sistema leve, rápido e com custo de manutenção zero para o cliente.

### **Frontend (Interface)**
* **JavaScript (ES6+):** Utilizado para criar uma experiência dinâmica, realizando comunicações assíncronas com a API sem recarregar a página.
* **Tailwind CSS:** Escolhido pela agilidade no desenvolvimento e pela garantia de um design responsivo e moderno, essencial para o acesso via smartphones.
* **HTML5 Semântico:** Para garantir acessibilidade e uma boa estrutura de dados.

### **Backend (API)**
* **Node.js & Express:** Frameworks de alta performance que permitem lidar com múltiplas requisições de forma rápida, ideal para um catálogo de consulta constante.
* **MongoDB Atlas:** Banco de dados NoSQL escolhido pela flexibilidade. Como peças de smartphones possuem diferentes especificações, o NoSQL permite armazenar esses dados variados sem "travar" a estrutura do banco.
* **Cloudinary (CDN de Mídia):** Utilizado para o armazenamento e otimização das imagens dos produtos, garantindo que as fotos carreguem instantaneamente em qualquer dispositivo.
* **JWT (JSON Web Token):** Implementado para garantir que apenas administradores autorizados possam alterar o inventário.

### **Infraestrutura (Cloud)**
* **Vercel:** Hospedagem do Frontend para garantir carregamento instantâneo.
* **Railway:** Plataforma de nuvem utilizada para o deploy da API, garantindo que o servidor esteja sempre disponível com monitoramento em tempo real.

---

## 💡 Funcionalidades Principais

* **Gerenciador de Atributos Dinâmicos:** O sistema permite criar campos personalizados (ex: "Qualidade da Tela") que aparecem no cadastro apenas quando a categoria correspondente é selecionada.
* **Busca Inteligente:** Filtros por categorias e subcategorias que facilitam a navegação do cliente final.
* **Dashboard em Tempo Real:** Resumo estatístico da quantidade de produtos cadastrados em cada categoria.
* **Gestão Inteligente de Mídia:** Lógica de backend que remove automaticamente fotos antigas do servidor quando um produto é editado ou excluído, evitando desperdício de armazenamento.

---

## 📈 Futuro do Projeto

O sistema foi arquitetado de forma modular, o que permite que ele evolua para um **ERP completo**, integrando futuramente módulos de vendas, controle financeiro e emissão de notas fiscais, tornando-se o coração tecnológico da Jack Peças.

---

### 🌟 Diferencial Acadêmico
Este é um projeto de ciclo completo (**Full Stack**), cobrindo desde o levantamento de requisitos com o cliente local até o deploy final em ambientes de produção na nuvem. Representa a aplicação prática da tecnologia para resolver problemas reais de pequenos empreendedores.

---
Desenvolvido por Alejandro Carvalho - 2026