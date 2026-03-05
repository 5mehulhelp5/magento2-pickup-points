<?php
/**
 * @package     Innosend_PickupPoints
 * @author      Henk Valk (henk@falconmedia.nl)
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Tests\Unit\Model;

use Innosend\Integration\Api\ClientInterface;
use Innosend\PickupPoints\Helper\DistanceCalculator;
use Innosend\PickupPoints\Model\PickupPoint;
use Innosend\PickupPoints\Model\PickupPointRepository;
use Magento\Framework\Exception\LocalizedException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Unit tests for PickupPointRepository
 */
class PickupPointRepositoryTest extends TestCase
{
    /** @var ClientInterface&MockObject */
    private $apiClient;

    /** @var LoggerInterface&MockObject */
    private $logger;

    /** @var DistanceCalculator&MockObject */
    private $distanceCalculator;

    private PickupPointRepository $repository;

    protected function setUp(): void
    {
        $this->apiClient          = $this->createMock(ClientInterface::class);
        $this->logger             = $this->createMock(LoggerInterface::class);
        $this->distanceCalculator = $this->createMock(DistanceCalculator::class);

        $this->repository = new PickupPointRepository(
            $this->apiClient,
            $this->logger,
            $this->distanceCalculator
        );
    }

    // -----------------------------------------------------------------------
    // getPickupPoints – disabled
    // -----------------------------------------------------------------------

    public function testGetPickupPointsThrowsWhenApiNotEnabled(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(false);

        $this->expectException(LocalizedException::class);
        $this->repository->getPickupPoints('Damrak', '1012', 'Amsterdam', 'NL');
    }

    // -----------------------------------------------------------------------
    // getPickupPoints – API response mapping
    // -----------------------------------------------------------------------

    public function testGetPickupPointsReturnsEmptyArrayForEmptyResponse(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(true);
        $this->apiClient->method('get')->willReturn([]);

        $result = $this->repository->getPickupPoints('Damrak', '1012', 'Amsterdam', 'NL');
        $this->assertSame([], $result);
    }

    public function testGetPickupPointsMapsApiResponseToPickupPointObjects(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(true);
        $this->apiClient->method('get')->willReturn([
            [
                'courier'   => [
                    'name'   => 'DHL',
                    'images' => ['small' => 'https://logo.png', 'mark' => 'https://mark.png'],
                ],
                'locations' => [
                    [
                        'id'      => 'PP001',
                        'name'    => 'DHL ServicePoint Amsterdam',
                        'address' => [
                            'street_address' => 'Damrak 1',
                            'zip_code'       => '1012AB',
                            'city'           => 'Amsterdam',
                            'country_code'   => 'NL',
                        ],
                        'geo'     => ['latitude' => 52.37, 'longitude' => 4.89],
                        'opening_hours'   => [],
                        'closure_periods' => [],
                    ],
                ],
            ],
        ]);

        $result = $this->repository->getPickupPoints('Damrak', '1012', 'Amsterdam', 'NL');

        $this->assertCount(1, $result);
        $this->assertInstanceOf(PickupPoint::class, $result[0]);
        $this->assertSame('PP001', $result[0]->getId());
        $this->assertSame('DHL ServicePoint Amsterdam', $result[0]->getName());
        $this->assertSame('dhl', $result[0]->getCarrier());
        $this->assertSame('https://logo.png', $result[0]->getLogo());
        $this->assertSame((float) 52.37, $result[0]->getLatitude());
        $this->assertSame((float) 4.89, $result[0]->getLongitude());
    }

    public function testGetPickupPointsFiltersCarrierErrorResponses(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(true);
        $this->apiClient->method('get')->willReturn([
            ['error' => 'Carrier not available'],
        ]);

        $result = $this->repository->getPickupPoints('Damrak', '1012', 'Amsterdam', 'NL');
        $this->assertSame([], $result);
    }

    public function testGetPickupPointsPassesCouriersArrayToApi(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(true);

        $this->apiClient->expects($this->once())
            ->method('get')
            ->with(
                'pickup-point/',
                $this->callback(function (array $params) {
                    return isset($params['couriers']) && $params['couriers'] === ['DHL'];
                })
            )
            ->willReturn([]);

        $this->repository->getPickupPoints('Damrak', '1012', 'Amsterdam', 'NL', ['DHL']);
    }

    public function testGetPickupPointsMakesMultipleCallsForMultipleCarriers(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(true);

        $this->apiClient->expects($this->exactly(2))
            ->method('get')
            ->willReturn([]);

        $this->repository->getPickupPoints('Damrak', '1012', 'Amsterdam', 'NL', ['DHL', 'PostNL']);
    }

    // -----------------------------------------------------------------------
    // getPickupPointsByCoordinates
    // -----------------------------------------------------------------------

    public function testGetPickupPointsByCoordinatesThrowsWhenApiNotEnabled(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(false);

        $this->expectException(LocalizedException::class);
        $this->repository->getPickupPointsByCoordinates(52.37, 4.89, 'NL');
    }

    public function testGetPickupPointsByCoordinatesReturnsPickupPoints(): void
    {
        $this->apiClient->method('isEnabled')->willReturn(true);
        $this->apiClient->method('get')->willReturn([
            [
                'courier'   => ['name' => 'PostNL', 'images' => []],
                'locations' => [
                    [
                        'id'      => 'PNL001',
                        'name'    => 'PostNL Punt',
                        'address' => [
                            'street_address' => 'Keizersgracht 1',
                            'zip_code'       => '1015',
                            'city'           => 'Amsterdam',
                            'country_code'   => 'NL',
                        ],
                        'geo'            => ['latitude' => 52.38, 'longitude' => 4.90],
                        'opening_hours'  => [],
                        'closure_periods' => [],
                    ],
                ],
            ],
        ]);

        $result = $this->repository->getPickupPointsByCoordinates(52.37, 4.89, 'NL');

        $this->assertCount(1, $result);
        $this->assertSame('PNL001', $result[0]->getId());
        $this->assertSame('postnl', $result[0]->getCarrier());
    }

    // -----------------------------------------------------------------------
    // getLastApiRequestUrl
    // -----------------------------------------------------------------------

    public function testGetLastApiRequestUrlReturnsNullByDefault(): void
    {
        $this->assertNull($this->repository->getLastApiRequestUrl());
    }
}
