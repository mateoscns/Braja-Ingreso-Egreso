package com.braja.fichaje.campaign;

import com.braja.fichaje.notifications.PushEndpointValidator;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Test doubles for the two things outside the backend (time and the push provider), plus the SQL statement counter. */
@TestConfiguration(proxyBeanMethods = false)
class CampaignTestConfiguration {
    @Bean
    @Primary
    MutableClock campaignClock() {
        return new MutableClock();
    }

    @Bean
    @Primary
    FakeWebPushGateway campaignWebPushGateway(PushEndpointValidator validator) {
        return new FakeWebPushGateway(validator);
    }

    /** SQL statement counter for S67; static because a BeanPostProcessor must not wait for this class. Inert unless started. */
    @Bean
    static StatementCounter campaignStatementCounter() {
        return new StatementCounter();
    }
}
