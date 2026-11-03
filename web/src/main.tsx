import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./componentes/Layout";
import { ProvedorApp } from "./contexto";
import "./estilos.css";
import { Catalogo } from "./paginas/Catalogo";
import { ComparacaoTematica } from "./paginas/ComparacaoTematica";
import { Comparador } from "./paginas/Comparador";
import { Iniciativa } from "./paginas/Iniciativa";
import { Inicio } from "./paginas/Inicio";
import { Mapa } from "./paginas/Mapa";
import { Metodologia } from "./paginas/Metodologia";
import { Painel } from "./paginas/Painel";
import { Universidade } from "./paginas/Universidade";
import { Universidades } from "./paginas/Universidades";

// Área administrativa carregada sob demanda: o visitante público não baixa esse código.
const adm = <K extends string>(carregar: () => Promise<Record<K, any>>, nome: K) => lazy(() => carregar().then((m) => ({ default: m[nome] })));
const Login = adm(() => import("./paginas/admin/AdminBase"), "Login");
const AdminLayout = adm(() => import("./paginas/admin/AdminBase"), "AdminLayout");
const AdminPainel = adm(() => import("./paginas/admin/AdminBase"), "AdminPainel");
const Coleta = adm(() => import("./paginas/admin/Coleta"), "Coleta");
const ExecucaoDetalhe = adm(() => import("./paginas/admin/Coleta"), "ExecucaoDetalhe");
const AdminDocumentos = adm(() => import("./paginas/admin/Registros"), "AdminDocumentos");
const AdminIniciativa = adm(() => import("./paginas/admin/Registros"), "AdminIniciativa");
const AdminIniciativas = adm(() => import("./paginas/admin/Registros"), "AdminIniciativas");
const AdminUniversidade = adm(() => import("./paginas/admin/Registros"), "AdminUniversidade");
const AdminUniversidades = adm(() => import("./paginas/admin/Registros"), "AdminUniversidades");
const CandidatoDetalhe = adm(() => import("./paginas/admin/Revisao"), "CandidatoDetalhe");
const FilaRevisao = adm(() => import("./paginas/admin/Revisao"), "FilaRevisao");
const Duplicidades = adm(() => import("./paginas/admin/Sistema"), "Duplicidades");
const Exportar = adm(() => import("./paginas/admin/Sistema"), "Exportar");
const Historico = adm(() => import("./paginas/admin/Sistema"), "Historico");
const Relatos = adm(() => import("./paginas/admin/Sistema"), "Relatos");
const Tarefas = adm(() => import("./paginas/admin/Sistema"), "Tarefas");
const Usuarios = adm(() => import("./paginas/admin/Sistema"), "Usuarios");
const Validacao = adm(() => import("./paginas/admin/Validacao"), "Validacao");

try {
  const tema = localStorage.getItem("onismu:tema");
  if (tema) document.documentElement.dataset.theme = tema;
} catch { /* armazenamento indisponível */ }

function NaoEncontrada() {
  return <div className="vazio"><h1>Página não encontrada</h1><Link to="/">Voltar ao início</Link></div>;
}

export function Rotas() {
  return (
    <Suspense fallback={<p className="discreto" role="status">Carregando…</p>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="painel" element={<Painel />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="iniciativas" element={<Catalogo />} />
        <Route path="iniciativas/:id" element={<Iniciativa />} />
        <Route path="universidades" element={<Universidades />} />
        <Route path="universidades/:id" element={<Universidade />} />
        <Route path="comparar" element={<Comparador />} />
        <Route path="tematica" element={<ComparacaoTematica />} />
        <Route path="metodologia" element={<Metodologia />} />
        <Route path="admin/entrar" element={<Login />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminPainel />} />
          <Route path="validacao" element={<Validacao />} />
          <Route path="revisao" element={<FilaRevisao />} />
          <Route path="revisao/:id" element={<CandidatoDetalhe />} />
          <Route path="coleta" element={<Coleta />} />
          <Route path="coleta/:id" element={<ExecucaoDetalhe />} />
          <Route path="universidades" element={<AdminUniversidades />} />
          <Route path="universidades/:id" element={<AdminUniversidade />} />
          <Route path="iniciativas" element={<AdminIniciativas />} />
          <Route path="iniciativas/:id" element={<AdminIniciativa />} />
          <Route path="documentos" element={<AdminDocumentos />} />
          <Route path="duplicidades" element={<Duplicidades />} />
          <Route path="historico" element={<Historico />} />
          <Route path="relatos" element={<Relatos />} />
          <Route path="tarefas" element={<Tarefas />} />
          <Route path="exportar" element={<Exportar />} />
          <Route path="usuarios" element={<Usuarios />} />
        </Route>
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

const raiz = document.getElementById("raiz");
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorApp><Rotas /></ProvedorApp>
      </BrowserRouter>
    </StrictMode>,
  );
}
