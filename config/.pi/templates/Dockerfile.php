FROM php:8.3-fpm-bookworm

# Install PHP extensions required by Drupal
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfreetype6-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
    libzip-dev libicu-dev libxml2-dev libonig-dev \
    libpq-dev libsqlite3-dev \
    unzip git curl && \
    docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp && \
    docker-php-ext-install -j$(nproc) \
        gd mbstring opcache intl zip xml pdo pdo_mysql pdo_pgsql pdo_sqlite \
        bcmath soap && \
    pecl install apcu && docker-php-ext-enable apcu && \
    rm -rf /var/lib/apt/lists/*

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

# PHP config optimized for development
RUN { \
    echo 'opcache.memory_consumption=256'; \
    echo 'opcache.interned_strings_buffer=16'; \
    echo 'opcache.max_accelerated_files=20000'; \
    echo 'opcache.validate_timestamps=1'; \
    echo 'opcache.revalidate_freq=0'; \
    echo 'opcache.enable_cli=1'; \
    } > /usr/local/etc/php/conf.d/opcache.ini && \
    { \
    echo 'upload_max_filesize=64M'; \
    echo 'post_max_size=64M'; \
    echo 'memory_limit=512M'; \
    echo 'max_execution_time=300'; \
    echo 'display_errors=On'; \
    echo 'error_reporting=E_ALL'; \
    } > /usr/local/etc/php/conf.d/drupal-dev.ini

WORKDIR /var/www/html
