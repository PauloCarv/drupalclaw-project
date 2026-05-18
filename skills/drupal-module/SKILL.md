---
name: drupal-module
description: Scaffolda um novo módulo custom Drupal com estrutura base.
distribution: public
---

# drupal-module

Cria um novo módulo custom com ficheiros base.

## Steps

1. Pedir nome do módulo (se não fornecido):
   - Se o utilizador incluiu um nome na mensagem, usa esse.
   - Caso contrário, sugere um nome e pergunta.

2. Validar nome:
   ```bash
   MODULE_NAME="${1:-my_module}"
   MODULE_NAME=$(echo "$MODULE_NAME" | tr '-' '_' | tr '[:upper:]' '[:lower:]')
   MODULE_DIR="web/modules/custom/$MODULE_NAME"

   if [[ -d "$MODULE_DIR" ]]; then
     echo "⚠ Módulo $MODULE_NAME já existe em $MODULE_DIR"
     ls -la "$MODULE_DIR"
     exit 0
   fi
   ```

3. Criar estrutura:
   ```bash
   mkdir -p "$MODULE_DIR/src/Controller"
   mkdir -p "$MODULE_DIR/src/Form"
   mkdir -p "$MODULE_DIR/src/Plugin/Block"
   mkdir -p "$MODULE_DIR/templates"
   mkdir -p "$MODULE_DIR/config/install"
   ```

4. Criar .info.yml:
   ```bash
   cat > "$MODULE_DIR/$MODULE_NAME.info.yml" << EOF
   name: '$MODULE_NAME'
   type: module
   description: 'Custom module: $MODULE_NAME'
   core_version_requirement: ^10 || ^11
   package: Custom
   EOF
   ```

5. Criar .module:
   ```bash
   cat > "$MODULE_DIR/$MODULE_NAME.module" << 'EOF'
   <?php

   /**
    * @file
    * Primary module hooks.
    */
   EOF
   ```

6. Criar .routing.yml vazio:
   ```bash
   touch "$MODULE_DIR/$MODULE_NAME.routing.yml"
   ```

7. Reportar:
   ```bash
   echo "✅ Módulo criado em $MODULE_DIR"
   echo "Ficheiros:"
   find "$MODULE_DIR" -type f
   echo ""
   echo "Para activar: vendor/bin/drush en $MODULE_NAME"
   ```
