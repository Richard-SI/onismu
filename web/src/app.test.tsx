import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qs } from "./api";
import { ProvedorApp } from "./contexto";
import { Rotas } from "./main";

const indicadores = {
  universo: 206, concluidas: 2, iniciativas_validadas: 5, politicas_formalizadas: 1, data_atualizacao: "2026-10-22T12:00:00Z",
  situacao_pesquisa: { nao_pesquisada: 200, em_pesquisa: 0, aguardando_validacao: 4, concluida_com_iniciativas: 1, concluida_sem_iniciativas: 1, inconclusiva: 0 },
  em_validacao: { candidatos_pendentes: 103, iniciativas_pendentes: 0 },
  indicadores: {
    cobertura_pesquisa: { valor: 1, numerador: 2, denominador: 206, formula: "f", rotulo_denominador: "universidades no universo institucional" },
    universidades_com_iniciativas: { valor: 50, numerador: 1, denominador: 2, formula: "f", rotulo_denominador: "universidades com pesquisa concluída" },
    cobertura_documental_politicas: { valor: 50, numerador: 1, denominador: 2, formula: "f", rotulo_denominador: "universidades com pesquisa concluída" },
  },
  por_categoria: { denominador: 5, rotulo_denominador: "iniciativas validadas", itens: [{ categoria: "servico_permanente", nome: "Serviço permanente", n: 5, percentual: 100 }] },
  por_regiao: [], por_grau_evidencia: [{ grau: 3, n: 5 }], evolucao_verificacoes: [], cobertura_incompleta: true,
};

function responder(rotas: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const chave = Object.keys(rotas).find((k) => url.startsWith(k));
    const corpo = chave ? rotas[chave] : { erro: "não encontrado" };
    return new Response(JSON.stringify(corpo), { status: chave ? 200 : 404, headers: { "content-type": "application/json" } });
  }));
}

const montar = (rota: string) => render(<MemoryRouter initialEntries={[rota]}><ProvedorApp><Rotas /></ProvedorApp></MemoryRouter>);

beforeEach(() => {
  window.scrollTo = vi.fn() as any;
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("utilitários", () => {
  it("monta query strings ignorando vazios", () => {
    expect(qs({ a: "1", b: ["x", "y"], c: [], d: undefined, e: "" })).toBe("?a=1&b=x%2Cy");
    expect(qs({})).toBe("");
  });
});

describe("telas públicas", () => {
  it("página inicial mostra indicadores do banco e aviso de cobertura", async () => {
    responder({ "/api/auth/sessao": { usuario: null }, "/api/publico/atualizacoes": { existem_dados_demonstrativos: false }, "/api/publico/indicadores": indicadores });
    montar("/");
    expect(await screen.findByText("206")).toBeInTheDocument();
    expect(screen.getByText(/103 registros sugeridos aguardam revisão/)).toBeInTheDocument();
    expect(screen.getByText(/Cobertura em construção/)).toBeInTheDocument();
    expect(screen.getByText(/não significa que a universidade não possua iniciativas/)).toBeInTheDocument();
  });

  it("catálogo exibe selo de dado demonstrativo e evidências", async () => {
    responder({
      "/api/auth/sessao": { usuario: null }, "/api/publico/atualizacoes": { existem_dados_demonstrativos: true },
      "/api/publico/iniciativas": { total: 1, pagina: 1, por_pagina: 20, total_paginas: 1, itens: [{
        id: 1, nome: "Plantão Psicológico", categoria_principal: "servico_permanente", grau_evidencia: 3, origem_dados: "demonstrativo",
        universidade_id: 9, universidade_sigla: "UDX", estado: "GO", regiao: "Centro-Oeste", publicos: ["estudantes"], situacao_documentada: "ativa",
        atualidade_fonte: "recente", n_evidencias: 2, tem_documento_normativo: false, descricao: "Atendimento.", data_ultima_verificacao: null,
      }] },
    });
    montar("/iniciativas");
    expect(await screen.findByText("Plantão Psicológico")).toBeInTheDocument();
    expect(screen.getByText(/DADO DEMONSTRATIVO/)).toBeInTheDocument();
    expect(screen.getByText(/2 evidência\(s\)/)).toBeInTheDocument();
  });

  it("comparador diferencia não pesquisada de sem iniciativas localizadas", async () => {
    const u = (id: number, sigla: string, situacao: string) => ({
      id, sigla, nome_oficial: sigla, situacao_pesquisa: situacao, categoria_administrativa: "publica_federal", regiao: "Sul", estado: "RS",
      municipio: "X", iniciativas_validadas: 0, por_categoria: {}, politicas_formalizadas: 0, publicos: [], abrangencia: {}, documentos: 0, fontes: 0, execucoes_coleta: 0,
    });
    responder({
      "/api/auth/sessao": { usuario: null }, "/api/publico/atualizacoes": { existem_dados_demonstrativos: false },
      "/api/publico/comparar": [u(1, "UA", "nao_pesquisada"), u(2, "UB", "concluida_sem_iniciativas")],
      "/api/publico/universidades": { itens: [], total: 0 },
    });
    montar("/comparar?ids=1,2");
    expect(await screen.findByText(/ausência de dados não indica ausência de iniciativas/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma iniciativa localizada nas fontes consultadas/)).toBeInTheDocument();
  });
});

describe("área administrativa", () => {
  it("redireciona para o login quando não há sessão", async () => {
    responder({ "/api/auth/sessao": { usuario: null }, "/api/publico/atualizacoes": { existem_dados_demonstrativos: false } });
    montar("/admin/revisao");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Acesso da equipe" })).toBeInTheDocument());
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });
});
