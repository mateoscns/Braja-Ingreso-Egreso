package com.braja.fichaje.campaign;

import org.springframework.beans.factory.config.BeanPostProcessor;

import javax.sql.DataSource;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Locale;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Counts the JDBC statements the backend executes (S67), without any new dependency: the application DataSource is
 * wrapped in a JDK proxy. It is shared by every campaign suite, so it stays a pure pass-through: outside a
 * {@link #start()}..{@link #stop()} window the proxy hands out the pool's own connections untouched. While recording,
 * every {@code execute*} call on a statement made from a new connection is recorded with its SQL text, from any thread
 * (HTTP requests run on server threads). Hikari's own housekeeping and connection-init SQL never pass through it.
 */
public final class StatementCounter implements BeanPostProcessor {
    private final AtomicBoolean recording = new AtomicBoolean();
    private final Queue<String> statements = new ConcurrentLinkedQueue<>();

    /** Clears what was recorded and starts recording. */
    public void start() {
        statements.clear();
        recording.set(true);
    }

    /** Stops recording and returns the SQL of every statement executed since {@link #start()}, in execution order. */
    public List<String> stop() {
        recording.set(false);
        return List.copyOf(statements);
    }

    /** The statements a request runs for itself: Spring Session's own SPRING_SESSION* reads and writes are left out. */
    public static List<String> withoutSessionStore(List<String> recorded) {
        return recorded.stream().filter(sql -> !sql.toUpperCase(Locale.ROOT).contains("SPRING_SESSION")).toList();
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean instanceof DataSource dataSource && !Proxy.isProxyClass(bean.getClass())) {
            return proxy(DataSource.class, dataSource, (method, args) -> {
                Object result = invoke(dataSource, method, args);
                return result instanceof Connection connection && recording.get() ? countedConnection(connection) : result;
            });
        }
        return bean;
    }

    private Connection countedConnection(Connection connection) {
        return proxy(Connection.class, connection, (method, args) -> {
            Object result = invoke(connection, method, args);
            if (result instanceof Statement statement && method.getName().startsWith("prepare")) {
                String sql = args != null && args.length > 0 && args[0] instanceof String text ? text : "?";
                Class<? extends Statement> type = statement instanceof CallableStatement ? CallableStatement.class : PreparedStatement.class;
                return countedStatement(type, statement, sql);
            }
            if (result instanceof Statement statement && method.getName().equals("createStatement")) {
                return countedStatement(Statement.class, statement, null);
            }
            return result;
        });
    }

    private <T extends Statement> T countedStatement(Class<T> type, Statement statement, String preparedSql) {
        return proxy(type, statement, (method, args) -> {
            if (method.getName().startsWith("execute") && recording.get()) {
                String sql = preparedSql != null ? preparedSql
                        : args != null && args.length > 0 && args[0] instanceof String text ? text : "batch";
                statements.add(sql);
            }
            return invoke(statement, method, args);
        });
    }

    private interface Call {
        Object handle(Method method, Object[] args) throws Throwable;
    }

    /** A proxy that is equal only to itself (DataSourceUtils keys transaction resources by it) and forwards the rest. */
    private static <T> T proxy(Class<T> type, Object target, Call call) {
        InvocationHandler handler = (self, method, args) -> switch (method.getName()) {
            case "equals" -> method.getParameterCount() == 1 ? self == args[0] : call.handle(method, args);
            case "hashCode" -> method.getParameterCount() == 0 ? System.identityHashCode(self) : call.handle(method, args);
            case "toString" -> method.getParameterCount() == 0 ? "Counted[" + target + "]" : call.handle(method, args);
            default -> call.handle(method, args);
        };
        return type.cast(Proxy.newProxyInstance(StatementCounter.class.getClassLoader(), new Class<?>[] {type}, handler));
    }

    /** Calls the real object and rethrows what it threw (an SQLException must reach Spring's exception translation). */
    private static Object invoke(Object target, Method method, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException ex) {
            throw ex.getCause();
        }
    }
}
