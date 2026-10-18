package com.braja.fichaje;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FichajeApplication {
    public static void main(String[] args) {
        SpringApplication.run(FichajeApplication.class, args);
    }
}
