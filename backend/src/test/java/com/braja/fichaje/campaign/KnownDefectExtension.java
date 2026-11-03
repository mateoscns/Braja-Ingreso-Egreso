package com.braja.fichaje.campaign;

import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.InvocationInterceptor;
import org.junit.jupiter.api.extension.ReflectiveInvocationContext;

import java.lang.reflect.Method;

/** Runs a {@link KnownDefect} test: the expected assertion failure passes, an unexpected pass fails. */
public final class KnownDefectExtension implements InvocationInterceptor {
    @Override
    public void interceptTestMethod(Invocation<Void> invocation, ReflectiveInvocationContext<Method> invocationContext,
                                    ExtensionContext extensionContext) throws Throwable {
        run(invocation, invocationContext.getExecutable(), extensionContext);
    }

    @Override
    public void interceptTestTemplateMethod(Invocation<Void> invocation, ReflectiveInvocationContext<Method> invocationContext,
                                            ExtensionContext extensionContext) throws Throwable {
        run(invocation, invocationContext.getExecutable(), extensionContext);
    }

    private static void run(Invocation<Void> invocation, Method method, ExtensionContext context) throws Throwable {
        KnownDefect defect = method.getAnnotation(KnownDefect.class);
        if (defect == null) {
            invocation.proceed();
            return;
        }
        try {
            invocation.proceed();
        } catch (AssertionError expected) {
            String entry = defect.issue() + ": " + defect.reason() + " | " + firstLine(expected);
            context.publishReportEntry("known-defect", entry);
            // Printed too, so the Maven output shows which assertion the known defect tripped.
            System.out.println("[known-defect] " + method.getDeclaringClass().getSimpleName() + "." + method.getName() + " -> " + entry);
            return;
        }
        throw new AssertionError("This test passes now: " + defect.issue() + " looks fixed. Remove @KnownDefect from "
                + method.getDeclaringClass().getSimpleName() + "." + method.getName() + " and lower the ceiling.");
    }

    private static String firstLine(Throwable error) {
        String message = String.valueOf(error.getMessage());
        int newline = message.indexOf('\n');
        return newline < 0 ? message : message.substring(0, newline);
    }
}
