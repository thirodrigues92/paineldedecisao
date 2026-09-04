export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          agendado_em: string | null
          agendado_por: string | null
          agendamento_id: number
          canal_id: number | null
          convenio_id: number | null
          created_at: string
          data: string
          duracao_min: number
          encaixe: boolean
          especialidade_id: number | null
          hora_fim_real: string | null
          hora_inicio_real: string | null
          horario: string | null
          local_id: number | null
          notas: string | null
          paciente_id: number | null
          plano_id: number | null
          primeiro_agendamento: boolean
          procedimento_id: number | null
          procedimentos_detalhe: Json
          profissional_id: number | null
          qtd_procedimentos: number
          retorno: boolean
          status_id: number | null
          tabela_id: number | null
          telemedicina: boolean
          tempo_permanencia_min: number | null
          unidade_id: number | null
          updated_at: string
          valor_estimado: number
          valor_origem: string | null
          valor_total: number
        }
        Insert: {
          agendado_em?: string | null
          agendado_por?: string | null
          agendamento_id: number
          canal_id?: number | null
          convenio_id?: number | null
          created_at?: string
          data: string
          duracao_min?: number
          encaixe?: boolean
          especialidade_id?: number | null
          hora_fim_real?: string | null
          hora_inicio_real?: string | null
          horario?: string | null
          local_id?: number | null
          notas?: string | null
          paciente_id?: number | null
          plano_id?: number | null
          primeiro_agendamento?: boolean
          procedimento_id?: number | null
          procedimentos_detalhe?: Json
          profissional_id?: number | null
          qtd_procedimentos?: number
          retorno?: boolean
          status_id?: number | null
          tabela_id?: number | null
          telemedicina?: boolean
          tempo_permanencia_min?: number | null
          unidade_id?: number | null
          updated_at?: string
          valor_estimado?: number
          valor_origem?: string | null
          valor_total?: number
        }
        Update: {
          agendado_em?: string | null
          agendado_por?: string | null
          agendamento_id?: number
          canal_id?: number | null
          convenio_id?: number | null
          created_at?: string
          data?: string
          duracao_min?: number
          encaixe?: boolean
          especialidade_id?: number | null
          hora_fim_real?: string | null
          hora_inicio_real?: string | null
          horario?: string | null
          local_id?: number | null
          notas?: string | null
          paciente_id?: number | null
          plano_id?: number | null
          primeiro_agendamento?: boolean
          procedimento_id?: number | null
          procedimentos_detalhe?: Json
          profissional_id?: number | null
          qtd_procedimentos?: number
          retorno?: boolean
          status_id?: number | null
          tabela_id?: number | null
          telemedicina?: boolean
          tempo_permanencia_min?: number | null
          unidade_id?: number | null
          updated_at?: string
          valor_estimado?: number
          valor_origem?: string | null
          valor_total?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          chave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      ceps_geocodificados: {
        Row: {
          bairro: string | null
          cep: string
          cidade: string | null
          estado: string | null
          geocoded_at: string
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          bairro?: string | null
          cep: string
          cidade?: string | null
          estado?: string | null
          geocoded_at?: string
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          bairro?: string | null
          cep?: string
          cidade?: string | null
          estado?: string | null
          geocoded_at?: string
          latitude?: number | null
          longitude?: number | null
        }
        Relationships: []
      }
      convenios: {
        Row: {
          convenio_id: number
          created_at: string
          nome: string
          planos: Json
          updated_at: string
        }
        Insert: {
          convenio_id: number
          created_at?: string
          nome: string
          planos?: Json
          updated_at?: string
        }
        Update: {
          convenio_id?: number
          created_at?: string
          nome?: string
          planos?: Json
          updated_at?: string
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          codigo_tiss: string | null
          created_at: string
          especialidade_id: number
          nome: string
          updated_at: string
        }
        Insert: {
          codigo_tiss?: string | null
          created_at?: string
          especialidade_id: number
          nome: string
          updated_at?: string
        }
        Update: {
          codigo_tiss?: string | null
          created_at?: string
          especialidade_id?: number
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      financeiro_lancamentos: {
        Row: {
          agendamento_id: number | null
          categoria: string | null
          centro_custo: string | null
          convenio_id: number | null
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao_item: string | null
          id: number
          procedimento_id: number | null
          status: string | null
          tipo: string
          unidade_id: number | null
          updated_at: string
          valor: number
        }
        Insert: {
          agendamento_id?: number | null
          categoria?: string | null
          centro_custo?: string | null
          convenio_id?: number | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao_item?: string | null
          id: number
          procedimento_id?: number | null
          status?: string | null
          tipo: string
          unidade_id?: number | null
          updated_at?: string
          valor?: number
        }
        Update: {
          agendamento_id?: number | null
          categoria?: string | null
          centro_custo?: string | null
          convenio_id?: number | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao_item?: string | null
          id?: number
          procedimento_id?: number | null
          status?: string | null
          tipo?: string
          unidade_id?: number | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      geo_bairros: {
        Row: {
          bairro: string
          cidade: string
          created_at: string
          estado: string
          geocoded_at: string
          id: string
          latitude: number | null
          longitude: number | null
          updated_at: string
        }
        Insert: {
          bairro: string
          cidade: string
          created_at?: string
          estado?: string
          geocoded_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
        }
        Update: {
          bairro?: string
          cidade?: string
          created_at?: string
          estado?: string
          geocoded_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      lab_agendamento_enriquecido: {
        Row: {
          agendamento_id: number
          atualizado_em: string | null
          canal_id: number | null
          categoria_receita: string
          convenio_id: number | null
          especialidade_id: number | null
          grupo_procedimento_id: number | null
          plano_id: number
          primeiro_agendamento: boolean | null
          procedimento_id: number | null
          profissional_id: number | null
          retorno: boolean | null
          sem_dados_agendamento: boolean | null
          status_id: number | null
          telemedicina: boolean | null
          unidade_id: number | null
        }
        Insert: {
          agendamento_id: number
          atualizado_em?: string | null
          canal_id?: number | null
          categoria_receita: string
          convenio_id?: number | null
          especialidade_id?: number | null
          grupo_procedimento_id?: number | null
          plano_id: number
          primeiro_agendamento?: boolean | null
          procedimento_id?: number | null
          profissional_id?: number | null
          retorno?: boolean | null
          sem_dados_agendamento?: boolean | null
          status_id?: number | null
          telemedicina?: boolean | null
          unidade_id?: number | null
        }
        Update: {
          agendamento_id?: number
          atualizado_em?: string | null
          canal_id?: number | null
          categoria_receita?: string
          convenio_id?: number | null
          especialidade_id?: number | null
          grupo_procedimento_id?: number | null
          plano_id?: number
          primeiro_agendamento?: boolean | null
          procedimento_id?: number | null
          profissional_id?: number | null
          retorno?: boolean | null
          sem_dados_agendamento?: boolean | null
          status_id?: number | null
          telemedicina?: boolean | null
          unidade_id?: number | null
        }
        Relationships: []
      }
      lab_convenios: {
        Row: {
          atualizado_em: string | null
          cnpj: string | null
          convenio_id: number
          nome: string
          registro_ans: string | null
        }
        Insert: {
          atualizado_em?: string | null
          cnpj?: string | null
          convenio_id: number
          nome: string
          registro_ans?: string | null
        }
        Update: {
          atualizado_em?: string | null
          cnpj?: string | null
          convenio_id?: number
          nome?: string
          registro_ans?: string | null
        }
        Relationships: []
      }
      lab_dim_agendamento: {
        Row: {
          agendamento_id: number
          canal_id: number | null
          convenio_id: number | null
          criado_em: string | null
          data: string | null
          especialidade_id: number | null
          paciente_id: number | null
          plano_id: number | null
          profissional_id: number | null
          status_id: number | null
          unidade_id: number | null
        }
        Insert: {
          agendamento_id: number
          canal_id?: number | null
          convenio_id?: number | null
          criado_em?: string | null
          data?: string | null
          especialidade_id?: number | null
          paciente_id?: number | null
          plano_id?: number | null
          profissional_id?: number | null
          status_id?: number | null
          unidade_id?: number | null
        }
        Update: {
          agendamento_id?: number
          canal_id?: number | null
          convenio_id?: number | null
          criado_em?: string | null
          data?: string | null
          especialidade_id?: number | null
          paciente_id?: number | null
          plano_id?: number | null
          profissional_id?: number | null
          status_id?: number | null
          unidade_id?: number | null
        }
        Relationships: []
      }
      lab_dim_categoria: {
        Row: {
          id: number
          nome: string | null
        }
        Insert: {
          id: number
          nome?: string | null
        }
        Update: {
          id?: number
          nome?: string | null
        }
        Relationships: []
      }
      lab_dim_centro_custo: {
        Row: {
          id: number
          nome: string | null
        }
        Insert: {
          id: number
          nome?: string | null
        }
        Update: {
          id?: number
          nome?: string | null
        }
        Relationships: []
      }
      lab_dim_procedimento: {
        Row: {
          criado_em: string | null
          grupo_id: number | null
          grupo_nome: string | null
          nome: string | null
          procedimento_id: number
          tipo: string | null
        }
        Insert: {
          criado_em?: string | null
          grupo_id?: number | null
          grupo_nome?: string | null
          nome?: string | null
          procedimento_id: number
          tipo?: string | null
        }
        Update: {
          criado_em?: string | null
          grupo_id?: number | null
          grupo_nome?: string | null
          nome?: string | null
          procedimento_id?: number
          tipo?: string | null
        }
        Relationships: []
      }
      lab_faturamento_legado: {
        Row: {
          acrescimo: number | null
          agendamento_id: number | null
          atendimento_id: number | null
          categoria_id: number | null
          centro_custo_id: number | null
          codigo_procedimento: string | null
          convenio_id: number | null
          convenio_nome: string | null
          data_atendimento: string | null
          data_competencia: string | null
          data_vencimento: string | null
          desconto: number | null
          documento_id: number
          especialidade_id: number | null
          glosado: number | null
          grupo_id: number | null
          grupo_nome: string | null
          guia_status: string | null
          id: string
          is_cancelado: boolean | null
          item_id: number | null
          local_nome: string | null
          lote_id: number | null
          motivo_glosa: string | null
          origem: string
          paciente_id: number | null
          paciente_nome: string | null
          payload_raw: Json | null
          plano_id: number | null
          procedimento_id: number | null
          procedimento_nome: string | null
          profissional_id: number | null
          prontuario: string | null
          synced_at: string | null
          tabela_id: number | null
          tipo_transacao: string | null
          unidade_id: number | null
          unidade_nome: string | null
          valor_bruto: number | null
          valor_faturado: number | null
        }
        Insert: {
          acrescimo?: number | null
          agendamento_id?: number | null
          atendimento_id?: number | null
          categoria_id?: number | null
          centro_custo_id?: number | null
          codigo_procedimento?: string | null
          convenio_id?: number | null
          convenio_nome?: string | null
          data_atendimento?: string | null
          data_competencia?: string | null
          data_vencimento?: string | null
          desconto?: number | null
          documento_id: number
          especialidade_id?: number | null
          glosado?: number | null
          grupo_id?: number | null
          grupo_nome?: string | null
          guia_status?: string | null
          id?: string
          is_cancelado?: boolean | null
          item_id?: number | null
          local_nome?: string | null
          lote_id?: number | null
          motivo_glosa?: string | null
          origem: string
          paciente_id?: number | null
          paciente_nome?: string | null
          payload_raw?: Json | null
          plano_id?: number | null
          procedimento_id?: number | null
          procedimento_nome?: string | null
          profissional_id?: number | null
          prontuario?: string | null
          synced_at?: string | null
          tabela_id?: number | null
          tipo_transacao?: string | null
          unidade_id?: number | null
          unidade_nome?: string | null
          valor_bruto?: number | null
          valor_faturado?: number | null
        }
        Update: {
          acrescimo?: number | null
          agendamento_id?: number | null
          atendimento_id?: number | null
          categoria_id?: number | null
          centro_custo_id?: number | null
          codigo_procedimento?: string | null
          convenio_id?: number | null
          convenio_nome?: string | null
          data_atendimento?: string | null
          data_competencia?: string | null
          data_vencimento?: string | null
          desconto?: number | null
          documento_id?: number
          especialidade_id?: number | null
          glosado?: number | null
          grupo_id?: number | null
          grupo_nome?: string | null
          guia_status?: string | null
          id?: string
          is_cancelado?: boolean | null
          item_id?: number | null
          local_nome?: string | null
          lote_id?: number | null
          motivo_glosa?: string | null
          origem?: string
          paciente_id?: number | null
          paciente_nome?: string | null
          payload_raw?: Json | null
          plano_id?: number | null
          procedimento_id?: number | null
          procedimento_nome?: string | null
          profissional_id?: number | null
          prontuario?: string | null
          synced_at?: string | null
          tabela_id?: number | null
          tipo_transacao?: string | null
          unidade_id?: number | null
          unidade_nome?: string | null
          valor_bruto?: number | null
          valor_faturado?: number | null
        }
        Relationships: []
      }
      lab_invoice_header: {
        Row: {
          criado_em: string | null
          data: string | null
          invoice_id: number
          paciente_id: number | null
          unidade_id: number | null
          valor_total: number | null
        }
        Insert: {
          criado_em?: string | null
          data?: string | null
          invoice_id: number
          paciente_id?: number | null
          unidade_id?: number | null
          valor_total?: number | null
        }
        Update: {
          criado_em?: string | null
          data?: string | null
          invoice_id?: number
          paciente_id?: number | null
          unidade_id?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      lab_producao_feegow: {
        Row: {
          agendamento_id: number
          convenio_id: number | null
          convenio_nome: string | null
          created_at: string | null
          data_execucao: string | null
          feegow_id: number | null
          forma_pagamento: string | null
          grupo_id: number | null
          grupo_nome: string | null
          hora_inicio: string | null
          id: string
          id_transacao: string
          n_guia_prestador: string
          paciente_id: number | null
          paciente_nome: string | null
          payload_raw: Json | null
          procedimento_id: number
          procedimento_nome: string | null
          profissional_id: number | null
          profissional_nome: string | null
          prontuario: string | null
          situacao: string | null
          situacao_conta: string | null
          tipo_guia: string | null
          tipo_procedimento: string | null
          unidade_id: number | null
          valor: number | null
          valor_pago: number | null
        }
        Insert: {
          agendamento_id?: number
          convenio_id?: number | null
          convenio_nome?: string | null
          created_at?: string | null
          data_execucao?: string | null
          feegow_id?: number | null
          forma_pagamento?: string | null
          grupo_id?: number | null
          grupo_nome?: string | null
          hora_inicio?: string | null
          id?: string
          id_transacao?: string
          n_guia_prestador?: string
          paciente_id?: number | null
          paciente_nome?: string | null
          payload_raw?: Json | null
          procedimento_id?: number
          procedimento_nome?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          prontuario?: string | null
          situacao?: string | null
          situacao_conta?: string | null
          tipo_guia?: string | null
          tipo_procedimento?: string | null
          unidade_id?: number | null
          valor?: number | null
          valor_pago?: number | null
        }
        Update: {
          agendamento_id?: number
          convenio_id?: number | null
          convenio_nome?: string | null
          created_at?: string | null
          data_execucao?: string | null
          feegow_id?: number | null
          forma_pagamento?: string | null
          grupo_id?: number | null
          grupo_nome?: string | null
          hora_inicio?: string | null
          id?: string
          id_transacao?: string
          n_guia_prestador?: string
          paciente_id?: number | null
          paciente_nome?: string | null
          payload_raw?: Json | null
          procedimento_id?: number
          procedimento_nome?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          prontuario?: string | null
          situacao?: string | null
          situacao_conta?: string | null
          tipo_guia?: string | null
          tipo_procedimento?: string | null
          unidade_id?: number | null
          valor?: number | null
          valor_pago?: number | null
        }
        Relationships: []
      }
      lab_recebimento: {
        Row: {
          bandeira_id: number | null
          conta_destino_id: number | null
          data_pagamento: string | null
          documento_id: number
          forma_pagamento: number | null
          id: string
          origem: string
          pagamento_id: number | null
          parcelas: number | null
          payload_raw: Json | null
          synced_at: string | null
          valor_recebido: number | null
        }
        Insert: {
          bandeira_id?: number | null
          conta_destino_id?: number | null
          data_pagamento?: string | null
          documento_id: number
          forma_pagamento?: number | null
          id?: string
          origem: string
          pagamento_id?: number | null
          parcelas?: number | null
          payload_raw?: Json | null
          synced_at?: string | null
          valor_recebido?: number | null
        }
        Update: {
          bandeira_id?: number | null
          conta_destino_id?: number | null
          data_pagamento?: string | null
          documento_id?: number
          forma_pagamento?: number | null
          id?: string
          origem?: string
          pagamento_id?: number | null
          parcelas?: number | null
          payload_raw?: Json | null
          synced_at?: string | null
          valor_recebido?: number | null
        }
        Relationships: []
      }
      lab_sync_log: {
        Row: {
          amostra_raw: Json | null
          api_success: boolean | null
          endpoint: string | null
          erro: string | null
          executado_em: string | null
          http_status: number | null
          id: string
          parametros: Json | null
          registros: number | null
        }
        Insert: {
          amostra_raw?: Json | null
          api_success?: boolean | null
          endpoint?: string | null
          erro?: string | null
          executado_em?: string | null
          http_status?: number | null
          id?: string
          parametros?: Json | null
          registros?: number | null
        }
        Update: {
          amostra_raw?: Json | null
          api_success?: boolean | null
          endpoint?: string | null
          erro?: string | null
          executado_em?: string | null
          http_status?: number | null
          id?: string
          parametros?: Json | null
          registros?: number | null
        }
        Relationships: []
      }
      lab_tabela_precos_convenio: {
        Row: {
          atualizado_em: string | null
          codigo_tuss: string | null
          convenio_id: number
          fonte: string | null
          id: number
          procedimento_id: number
          valor: number
        }
        Insert: {
          atualizado_em?: string | null
          codigo_tuss?: string | null
          convenio_id: number
          fonte?: string | null
          id?: number
          procedimento_id: number
          valor: number
        }
        Update: {
          atualizado_em?: string | null
          codigo_tuss?: string | null
          convenio_id?: number
          fonte?: string | null
          id?: number
          procedimento_id?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lab_tabela_precos_convenio_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "lab_convenios"
            referencedColumns: ["convenio_id"]
          },
          {
            foreignKeyName: "lab_tabela_precos_convenio_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["procedimento_id"]
          },
        ]
      }
      pacientes: {
        Row: {
          ano_nascimento: number | null
          bairro: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          contato_sincronizado_em: string | null
          convenio_id: number | null
          created_at: string
          estado: string | null
          latitude: number | null
          longitude: number | null
          metricas: Json
          nome: string | null
          origem_id: number | null
          paciente_id: number
          prontuario: string | null
          sexo: string | null
          updated_at: string
        }
        Insert: {
          ano_nascimento?: number | null
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          contato_sincronizado_em?: string | null
          convenio_id?: number | null
          created_at?: string
          estado?: string | null
          latitude?: number | null
          longitude?: number | null
          metricas?: Json
          nome?: string | null
          origem_id?: number | null
          paciente_id: number
          prontuario?: string | null
          sexo?: string | null
          updated_at?: string
        }
        Update: {
          ano_nascimento?: number | null
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          contato_sincronizado_em?: string | null
          convenio_id?: number | null
          created_at?: string
          estado?: string | null
          latitude?: number | null
          longitude?: number | null
          metricas?: Json
          nome?: string | null
          origem_id?: number | null
          paciente_id?: number
          prontuario?: string | null
          sexo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      procedimentos: {
        Row: {
          created_at: string
          grupo: string | null
          nome: string
          procedimento_id: number
          tipo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          grupo?: string | null
          nome: string
          procedimento_id: number
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          grupo?: string | null
          nome?: string
          procedimento_id?: number
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean
          created_at: string
          especialidades: Json
          nome: string
          profissional_id: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          especialidades?: Json
          nome: string
          profissional_id: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          especialidades?: Json
          nome?: string
          profissional_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      status_agendamento: {
        Row: {
          categoria: string
          created_at: string
          descricao: string
          status_id: number
          updated_at: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          descricao: string
          status_id: number
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descricao?: string
          status_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          endpoint: string
          erro: string | null
          finalizado_em: string | null
          id: number
          iniciado_em: string
          registros: number
          sucesso: boolean
        }
        Insert: {
          endpoint: string
          erro?: string | null
          finalizado_em?: string | null
          id?: number
          iniciado_em?: string
          registros?: number
          sucesso?: boolean
        }
        Update: {
          endpoint?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: number
          iniciado_em?: string
          registros?: number
          sucesso?: boolean
        }
        Relationships: []
      }
      unidades: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          created_at: string
          estado: string | null
          latitude: number | null
          longitude: number | null
          nome_fantasia: string
          unidade_id: number
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          estado?: string | null
          latitude?: number | null
          longitude?: number | null
          nome_fantasia: string
          unidade_id: number
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          estado?: string | null
          latitude?: number | null
          longitude?: number | null
          nome_fantasia?: string
          unidade_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      heatmap_agenda: {
        Row: {
          dia_semana: number | null
          especialidade_id: number | null
          faixa_horaria: number | null
          no_shows: number | null
          receita: number | null
          total: number | null
          unidade_id: number | null
        }
        Relationships: []
      }
      kpis_mensais: {
        Row: {
          mes: string | null
          no_shows: number | null
          pacientes_novos: number | null
          realizados: number | null
          receita_prevista: number | null
          receita_realizada: number | null
          taxa_no_show: number | null
          ticket_medio: number | null
          total_agendamentos: number | null
          unidade_id: number | null
        }
        Relationships: []
      }
      lab_vw_faturado_x_recebido: {
        Row: {
          grupo_nome: string | null
          mes: string | null
          origem: string | null
          saldo_a_receber: number | null
          total_faturado: number | null
          total_recebido: number | null
        }
        Relationships: []
      }
      pacientes_por_regiao: {
        Row: {
          bairro: string | null
          cidade: string | null
          especialidade_id: number | null
          pacientes: number | null
        }
        Relationships: []
      }
      vw_analytics_abc_procedimentos: {
        Row: {
          classe: string | null
          pct_acumulado: number | null
          procedimento: string | null
          procedimento_id: number | null
          receita: number | null
          volume: number | null
        }
        Relationships: []
      }
      vw_analytics_lead_time: {
        Row: {
          data: string | null
          especialidade: string | null
          especialidade_id: number | null
          lead_days: number | null
        }
        Relationships: []
      }
      vw_analytics_ocupacao_prof: {
        Row: {
          agendamentos: number | null
          data: string | null
          minutos_ocupados: number | null
          profissional: string | null
          profissional_id: number | null
        }
        Relationships: []
      }
      vw_analytics_receita_mensal: {
        Row: {
          despesa: number | null
          mes: string | null
          receita: number | null
        }
        Relationships: []
      }
      vw_analytics_ticket_medio_esp: {
        Row: {
          especialidade: string | null
          especialidade_id: number | null
          receita: number | null
          ticket_medio: number | null
          volume: number | null
        }
        Relationships: []
      }
      vw_demanda_especialidade_por_regiao: {
        Row: {
          atendimentos: number | null
          bairro: string | null
          cidade: string | null
          demanda: number | null
          especialidade: string | null
          estado: string | null
          no_shows: number | null
        }
        Relationships: []
      }
      vw_faturamento_categorizado: {
        Row: {
          acrescimo: number | null
          agendamento_id: number | null
          atendimento_id: number | null
          categoria_id: number | null
          categoria_receita: string | null
          centro_custo_id: number | null
          codigo_procedimento: string | null
          convenio_id: number | null
          convenio_nome: string | null
          data_atendimento: string | null
          data_competencia: string | null
          data_vencimento: string | null
          desconto: number | null
          documento_id: number | null
          e_convenio_id: number | null
          e_especialidade_id: number | null
          e_grupo_procedimento_id: number | null
          e_profissional_id: number | null
          e_unidade_id: number | null
          especialidade_id: number | null
          glosado: number | null
          grupo_id: number | null
          grupo_nome: string | null
          guia_status: string | null
          id: string | null
          is_cancelado: boolean | null
          item_id: number | null
          local_nome: string | null
          lote_id: number | null
          motivo_glosa: string | null
          nome_convenio: string | null
          origem: string | null
          paciente_id: number | null
          paciente_nome: string | null
          payload_raw: Json | null
          plano_id: number | null
          procedimento_id: number | null
          procedimento_nome: string | null
          profissional_id: number | null
          prontuario: string | null
          sem_dados_agendamento: boolean | null
          synced_at: string | null
          tabela_id: number | null
          tipo_transacao: string | null
          unidade_id: number | null
          unidade_nome: string | null
          valor_bruto: number | null
          valor_faturado: number | null
        }
        Relationships: []
      }
      vw_heatmap_agenda: {
        Row: {
          dia_semana: number | null
          especialidade_id: number | null
          faixa_horaria: number | null
          no_shows: number | null
          receita: number | null
          total: number | null
          unidade_id: number | null
        }
        Relationships: []
      }
      vw_heatmap_pacientes: {
        Row: {
          bairros: string[] | null
          cidade: string | null
          densidade: number | null
          latitude: number | null
          longitude: number | null
        }
        Relationships: []
      }
      vw_kpis_mensais: {
        Row: {
          mes: string | null
          no_shows: number | null
          pacientes_novos: number | null
          realizados: number | null
          receita_prevista: number | null
          receita_realizada: number | null
          taxa_no_show: number | null
          ticket_medio: number | null
          total_agendamentos: number | null
          unidade_id: number | null
        }
        Relationships: []
      }
      vw_pacientes_por_regiao: {
        Row: {
          bairro: string | null
          cidade: string | null
          especialidade_id: number | null
          pacientes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lab_enriquecer_faturamento: { Args: never; Returns: Json }
      lab_popular_dimensoes: { Args: never; Returns: undefined }
      refresh_dashboard_views: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "gestor" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor", "user"],
    },
  },
} as const
